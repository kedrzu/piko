import type { CdpPolicyClient, CdpPolicyResult, CdpRequest } from '@nzyme/stealth-browser';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { isAllowedUrl } from './isAllowedUrl.js';
import { stageUpload } from './stageUpload.js';
import { toHostUploadPath } from './toHostUploadPath.js';

/** What the daemon passes to `connect` for each tunnel client, and the policy reads. */
export interface ProductClientData {
    /** The profile's data root on this computer, for upload paths. */
    dataRoot: string;
    /** The daemon's own folder uploads are staged in (`stageUpload`'s `folder`). */
    uploadsFolder: string;
}

/**
 * What a tunnel client may call, by domain: `'*'` for the whole domain, or a list of method names. The browser runs on
 * this computer, so this table is where the agent's limits live (D27). Every domain here is reached only through a
 * session the client itself opened on its own conversation's page (`BROWSER_LEVEL_METHODS` aside), so a whole domain is
 * listed when everything in it acts on that one page: what the page renders and requests (Page, DOM, DOMSnapshot, CSS,
 * Input, Emulation, Accessibility, Overlay, Log), its traffic (Network, Fetch — the proxy still guards the network
 * itself), certificate handling (Security) and WebMCP. Runtime, Console and Debugger are listed as agent-browser uses
 * them; `@nzyme/stealth-browser` answers their `enable` and `disable` itself and sends every evaluation to an isolated
 * world (stealth-browsing D8). Cookies stay open on purpose (Network's and Storage's cookie methods): the agent shares
 * the profile's logins by design; the rest of Storage (quota, origin data, shared storage, interest groups) is not
 * needed. IO is limited to reading and closing streams the page's own commands returned. Browser offers only
 * `getVersion`; the rest of it (download behaviour, permissions, windows, closing) is the daemon's. Target offers what
 * the agent's CLI uses to find, open, attach to and close its pages; the package lets a client name only its own
 * conversation's targets and its own sessions. Left out on purpose: Extensions, PWA, FileSystem, Tracing, SystemInfo,
 * Memory, HeapProfiler, Profiler, Cast, BackgroundService, DeviceAccess, Autofill, ServiceWorker, Tethering, and every
 * domain not named here. The list follows what agent-browser sends: adding a method it needs is one entry, re-checked
 * against this reasoning when agent-browser or Chrome is upgraded.
 */
const ALLOWED_METHODS: Record<string, '*' | readonly string[]> = {
    Accessibility: '*',
    Browser: ['getVersion'],
    CSS: '*',
    Console: ['enable', 'disable'],
    DOM: '*',
    DOMSnapshot: '*',
    Debugger: ['enable', 'disable'],
    Emulation: '*',
    Fetch: '*',
    IO: ['read', 'close'],
    Input: '*',
    Log: '*',
    Network: '*',
    Overlay: '*',
    Page: '*',
    Runtime: [
        'enable',
        'disable',
        'evaluate',
        'callFunctionOn',
        'getProperties',
        'awaitPromise',
        'releaseObject',
        'releaseObjectGroup',
        'runIfWaitingForDebugger',
    ],
    Security: '*',
    Storage: ['getCookies', 'setCookies', 'clearCookies'],
    Target: [
        'getTargets',
        'setDiscoverTargets',
        'attachToTarget',
        'detachFromTarget',
        'createTarget',
        'closeTarget',
        'activateTarget',
        'getTargetInfo',
        'setAutoAttach',
    ],
    WebMCP: '*',
};

/**
 * The methods a client may send with no `sessionId`, i.e. to the browser itself. Anything else must go through the
 * client's own session: a domain enabled on the browser target acts on every page (`Fetch.enable` there would intercept
 * every conversation's requests).
 */
const BROWSER_LEVEL_METHODS = new Set([
    'Browser.getVersion',
    'Target.getTargets',
    'Target.setDiscoverTargets',
    'Target.attachToTarget',
    'Target.detachFromTarget',
    'Target.createTarget',
    'Target.closeTarget',
    'Target.activateTarget',
    'Target.getTargetInfo',
]);

/**
 * The daemon's policy for a tunnel client's command (`CdpPolicy`), run by `@nzyme/stealth-browser` after it checked
 * that the session is the client's own and every target it names is its conversation's, and before its stealth rules:
 * the method must be allowed (`ALLOWED_METHODS`) and browser-level only when listed (`BROWSER_LEVEL_METHODS`), navigate
 * only where `isAllowedUrl` permits, and upload only files of the data root, which are staged and passed on as copies.
 * A new page always opens minimized in the background, and nothing the agent sends may bring the browser to the front.
 * It runs in the session's place in line, so uploads are staged in the order the agent sent them.
 */
export async function checkProductRequest(
    request: CdpRequest,
    client: CdpPolicyClient<ProductClientData>,
): Promise<CdpPolicyResult> {
    const { method, params, sessionId } = request;
    if (!isAllowedMethod(method)) {
        return { reject: `${method} is not allowed in the agent's browser` };
    }
    if (sessionId == null && !BROWSER_LEVEL_METHODS.has(method)) {
        return { reject: `${method} must be sent on a session of your own page` };
    }

    switch (method) {
        case 'Page.navigate':
        case 'Network.loadNetworkResource':
            return isAllowedUrl(params['url'])
                ? request
                : { reject: `${method}: only http:, https: and about:blank can be opened` };
        case 'Fetch.continueRequest':
            // The rewritten URL is a navigation the page never asked for.
            return params['url'] == null || isAllowedUrl(params['url'])
                ? request
                : { reject: `${method}: only http: and https: requests can be continued` };
        case 'Target.createTarget':
            return checkCreateTarget(request);
        case 'Page.setDownloadBehavior':
            return { reject: `${method}: downloads are set up by poweragents` };
        case 'Emulation.setUserAgentOverride':
        case 'Network.setUserAgentOverride':
            return { reject: `${method}: the browser's identity is set by poweragents and cannot be changed` };
        case 'Page.bringToFront':
        case 'Target.activateTarget':
            // Activating raises the window over the person's work; the daemon alone does that, for a handoff. The package
            // has already refused a target of another conversation.
            return { reply: {} };
        case 'Target.getTargetInfo':
            // With no target the browser would describe itself.
            return params['targetId'] == null && sessionId == null
                ? { reject: `${method}: name a target of your own` }
                : request;
        case 'DOM.setFileInputFiles':
            return stageFileInput(request, client.data);
        case 'Input.dispatchDragEvent':
            return isNoFiles(isPlainObject(params['data']) ? params['data']['files'] : undefined)
                ? request
                : { reject: `${method}: dropping files is not allowed, use DOM.setFileInputFiles` };
        default:
            return request;
    }
}

function checkCreateTarget(request: CdpRequest): CdpPolicyResult {
    const url = request.params['url'] ?? 'about:blank';
    if (!isAllowedUrl(url)) {
        return { reject: `${request.method}: only http:, https: and about:blank can be opened` };
    }
    // Built from scratch: focus, hidden, forTab, browserContextId and bounds never reach the browser.
    return {
        method: request.method,
        params: { url, background: true, newWindow: true, windowState: 'minimized' },
    };
}

/**
 * Maps each path the agent names (`/Poweragents/…`) to the data root, stages a copy of each (`stageUpload`), and passes
 * the command on with the copies' paths; any path outside `/Poweragents`, or a file `stageUpload` refuses, refuses it.
 */
async function stageFileInput(request: CdpRequest, data: ProductClientData): Promise<CdpPolicyResult> {
    const { method } = request;
    const { files: agentPaths } = request.params;
    if (!Array.isArray(agentPaths)) {
        return { reject: `${method}: files must be a list of paths` };
    }
    const list: readonly unknown[] = agentPaths;
    const sources: string[] = [];
    for (const agentPath of list) {
        const hostPath = toHostUploadPath(agentPath, data.dataRoot);
        if (hostPath == null) {
            return { reject: `${method}: only files inside /Poweragents can be uploaded, not ${String(agentPath)}` };
        }
        sources.push(hostPath);
    }

    const staged: string[] = [];
    try {
        for (const source of sources) {
            staged.push(await stageUpload({ source, dataRoot: data.dataRoot, folder: data.uploadsFolder }));
        }
    } catch (error) {
        return { reject: `${method}: ${error instanceof Error ? error.message : 'the file could not be uploaded'}` };
    }
    return { ...request, params: { ...request.params, files: staged } };
}

function isAllowedMethod(method: string) {
    const dot = method.indexOf('.');
    const domain = method.slice(0, dot);
    if (dot <= 0 || !Object.hasOwn(ALLOWED_METHODS, domain)) {
        return false;
    }
    const allowed = ALLOWED_METHODS[domain];
    return allowed === '*' || allowed?.includes(method.slice(dot + 1)) === true;
}

function isNoFiles(files: unknown) {
    return files == null || (Array.isArray(files) && files.length === 0);
}
