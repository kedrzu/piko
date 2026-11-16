import { assert } from '@nzyme/utils/assert.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { ISOLATED_WORLD_NAME } from './createIsolatedWorlds.js';
import type { IsolatedCall } from './createIsolatedWorlds.js';
import type { TargetOwnership } from './createTargetOwnership.js';
import { isAllowedUrl } from './isAllowedUrl.js';
import { toHostUploadPath } from './toHostUploadPath.js';

/** Who sent a tunnel message and what the policy needs to judge it. */
export interface CdpRequestContext {
    /** The tunnel socket the message came on. */
    clientId: string;
    /** The conversation the socket belongs to; it owns the pages the client may touch. */
    conversationId: string;
    ownership: Pick<TargetOwnership, 'getTargetOwner' | 'getSessionOriginator'>;
    /** The profile's data root on this computer, for upload paths. */
    dataRoot: string;
}

/** CDP parameters, unchecked beyond being an object. */
export type CdpParams = Record<string, unknown>;

/** What the tunnel does with a client's message. */
export type CdpRequestDecision =
    /** Send it to the browser as given here (params may be rebuilt), on `sessionId` when set. */
    | { type: 'forward'; method: string; params: CdpParams; sessionId?: string }
    /**
     * A `DOM.setFileInputFiles`: stage each of `files` (host paths) with `stageUpload`, then send the method on
     * `sessionId` with `params` plus `files` set to the copies' paths.
     */
    | { type: 'upload'; files: string[]; params: CdpParams; sessionId: string }
    /** Run it in the daemon's isolated world (`IsolatedWorlds.send`). */
    | { type: 'isolate'; call: IsolatedCall }
    /** Answer the client with `result` without touching the browser. */
    | { type: 'reply'; result: CdpParams }
    /** Answer the client with a CDP error carrying `message`. */
    | { type: 'reject'; message: string };

/**
 * What a tunnel client may call, by domain: `'*'` for the whole domain, or a list of method names. The browser runs on
 * this computer, so this table is where the agent's limits live (D27). Every domain here is reached only through a
 * session the client itself opened on its own conversation's page (`BROWSER_LEVEL_METHODS` aside), so a whole domain is
 * listed when everything in it acts on that one page: what the page renders and requests (Page, DOM, DOMSnapshot, CSS,
 * Input, Emulation, Accessibility, Overlay, Log), its traffic (Network, Fetch — the proxy still guards the network
 * itself), certificate handling (Security) and WebMCP. Runtime is listed by method, and Console and Debugger offer only
 * their enable and disable, because page scripts must never observe our code (stealth-browsing D8): an enabled
 * Runtime, Console or Debugger domain is measurable from the page, so the daemon answers those itself and never enables
 * them; every evaluation, resolved node, init script and binding goes to an isolated world (`ISOLATED_WORLD_NAME`),
 * never the page's own. Runtime keeps what agent-browser calls and what works on objects it got back (properties,
 * releasing, awaiting); `compileScript` and `runScript` are left out, as they need a context id. Cookies stay open on
 * purpose (Network's and Storage's cookie methods): the agent shares the profile's logins by design; the rest of
 * Storage (quota, origin data, shared storage, interest groups) is not needed. IO is limited to reading and closing
 * streams the page's own commands returned. Browser offers only `getVersion`; the rest of it (download behaviour,
 * permissions, windows, closing) is the daemon's. Target offers what the agent's CLI uses to find, open, attach to and
 * close its pages; the methods that name a target or session are checked against ownership in `checkCdpRequest`. Left
 * out on purpose: Extensions, PWA, FileSystem, Tracing, SystemInfo, Memory, HeapProfiler, Profiler, Cast,
 * BackgroundService, DeviceAccess, Autofill, ServiceWorker, Tethering, and every domain not named here. The list follows
 * what agent-browser sends: adding a method it needs is one entry, re-checked against this reasoning when agent-browser
 * or Chrome is upgraded.
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
        'addBinding',
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
 * Judges one message a tunnel client sent before it may reach the shared browser: the method must be allowed
 * (`ALLOWED_METHODS`), sent on a session this client opened unless it is browser-level (`BROWSER_LEVEL_METHODS`), name
 * only its own conversation's targets and sessions, navigate only where `isAllowedUrl` permits, and upload only files of
 * the data root. Some methods are rewritten or answered here: a new page always opens minimized in the background,
 * nothing the agent sends may bring the browser to the front, and no code of the agent's runs in the page's own world.
 * Pure: the caller does the IO the decision asks for.
 * @__NO_SIDE_EFFECTS__
 */
export function checkCdpRequest(message: unknown, context: CdpRequestContext): CdpRequestDecision {
    if (!isPlainObject(message) || typeof message['method'] !== 'string') {
        return reject('A CDP message needs a method');
    }
    const method = message['method'];
    const rawParams = message['params'] ?? {};
    const rawSessionId = message['sessionId'];
    if (!isPlainObject(rawParams)) {
        return reject(`${method}: params must be an object`);
    }
    if (rawSessionId != null && typeof rawSessionId !== 'string') {
        return reject(`${method}: sessionId must be a string`);
    }
    const sessionId = typeof rawSessionId === 'string' ? rawSessionId : undefined;
    if (!isAllowedMethod(method)) {
        return reject(`${method} is not allowed in the agent's browser`);
    }
    if (sessionId == null) {
        if (!BROWSER_LEVEL_METHODS.has(method)) {
            return reject(`${method} must be sent on a session of your own page`);
        }
    } else if (!isOwnSession(sessionId, context)) {
        return reject(`${method}: unknown session ${sessionId}`);
    }

    return checkMethod({ method, params: rawParams, sessionId }, context);
}

/** A message that passed the generic checks. */
interface CheckedRequest {
    method: string;
    params: CdpParams;
    sessionId: string | undefined;
}

function checkMethod(request: CheckedRequest, context: CdpRequestContext): CdpRequestDecision {
    const { method, params } = request;
    switch (method) {
        case 'Page.navigate':
        case 'Network.loadNetworkResource':
            return isAllowedUrl(params['url'])
                ? forward(request)
                : reject(`${method}: only http:, https: and about:blank can be opened`);
        case 'Fetch.continueRequest':
            // The rewritten URL is a navigation the page never asked for.
            return params['url'] == null || isAllowedUrl(params['url'])
                ? forward(request)
                : reject(`${method}: only http: and https: requests can be continued`);
        case 'Target.createTarget':
            return checkCreateTarget(request);
        case 'Page.setDownloadBehavior':
            return reject(`${method}: downloads are set up by poweragents`);
        case 'Page.bringToFront':
        case 'Target.activateTarget':
            return checkActivate(request, context);
        case 'Target.attachToTarget':
            return isOwnTarget(params['targetId'], context)
                ? forward(request, { targetId: params['targetId'], flatten: true })
                : reject(`${method}: unknown target`);
        case 'Target.closeTarget':
            return isOwnTarget(params['targetId'], context)
                ? forward(request, { targetId: params['targetId'] })
                : reject(`${method}: unknown target`);
        case 'Target.getTargetInfo':
            return checkGetTargetInfo(request, context);
        case 'Target.detachFromTarget':
            return isOwnSession(params['sessionId'], context)
                ? forward(request, { sessionId: params['sessionId'] })
                : reject(`${method}: only a session of your own can be detached, by sessionId`);
        case 'Target.setAutoAttach':
            return forward(request, {
                autoAttach: params['autoAttach'] === true,
                waitForDebuggerOnStart: params['waitForDebuggerOnStart'] === true,
                flatten: true,
            });
        case 'Target.setDiscoverTargets':
            return forward(request, { discover: params['discover'] === true });
        case 'Target.getTargets':
        case 'Browser.getVersion':
            return forward(request, {});
        case 'DOM.setFileInputFiles':
            return checkFileInput(request, context);
        case 'Input.dispatchDragEvent':
            return isNoFiles(isPlainObject(params['data']) ? params['data']['files'] : undefined)
                ? forward(request)
                : reject(`${method}: dropping files is not allowed, use DOM.setFileInputFiles`);
        case 'Runtime.enable':
        case 'Runtime.disable':
        case 'Console.enable':
        case 'Console.disable':
        case 'Debugger.enable':
        case 'Debugger.disable':
            return { type: 'reply', result: {} };
        case 'Runtime.evaluate':
            return checkIsolated(request, 'contextId');
        case 'Runtime.callFunctionOn':
        case 'DOM.resolveNode':
            return checkIsolated(request, 'executionContextId');
        case 'Runtime.addBinding':
            // A binding is a global of the world it lands in; never the page's.
            return forward(request, { name: params['name'], executionContextName: ISOLATED_WORLD_NAME });
        case 'Page.addScriptToEvaluateOnLoad':
            // Deprecated and world-less: the page's own world would run it. The reply, `{ identifier }`, is the same.
            return forward(
                { ...request, method: 'Page.addScriptToEvaluateOnNewDocument' },
                { source: params['scriptSource'], worldName: ISOLATED_WORLD_NAME },
            );
        case 'Page.addScriptToEvaluateOnNewDocument':
            return forward(request, {
                ...params,
                worldName:
                    typeof params['worldName'] === 'string' && params['worldName'] !== ''
                        ? params['worldName']
                        : ISOLATED_WORLD_NAME,
            });
        default:
            return forward(request);
    }
}

function checkCreateTarget(request: CheckedRequest): CdpRequestDecision {
    const url = request.params['url'] ?? 'about:blank';
    if (!isAllowedUrl(url)) {
        return reject(`${request.method}: only http:, https: and about:blank can be opened`);
    }
    // Built from scratch: focus, hidden, forTab, browserContextId and bounds never reach the browser.
    return forward(request, { url, background: true, newWindow: true, windowState: 'minimized' });
}

function checkActivate(request: CheckedRequest, context: CdpRequestContext): CdpRequestDecision {
    // Activating raises the window over the person's work; the daemon alone does that, for a handoff.
    if (request.method === 'Target.activateTarget' && !isOwnTarget(request.params['targetId'], context)) {
        return reject(`${request.method}: unknown target`);
    }
    return { type: 'reply', result: {} };
}

function checkGetTargetInfo(request: CheckedRequest, context: CdpRequestContext): CdpRequestDecision {
    const targetId = request.params['targetId'];
    if (targetId == null) {
        // With no target the browser describes the session's own target, or the browser itself on no session.
        return request.sessionId == null
            ? reject(`${request.method}: name a target of your own`)
            : forward(request, {});
    }
    return isOwnTarget(targetId, context)
        ? forward(request, { targetId })
        : reject(`${request.method}: unknown target`);
}

function checkFileInput(request: CheckedRequest, context: CdpRequestContext): CdpRequestDecision {
    const { method, sessionId } = request;
    const { files: agentPaths, ...params } = request.params;
    if (sessionId == null || !Array.isArray(agentPaths)) {
        return reject(`${method}: files must be a list of paths`);
    }
    const files: string[] = [];
    for (const agentPath of agentPaths) {
        const hostPath = toHostUploadPath(agentPath, context.dataRoot);
        if (hostPath == null) {
            return reject(`${method}: only files inside /Poweragents can be uploaded, not ${String(agentPath)}`);
        }
        files.push(hostPath);
    }
    return { type: 'upload', files, params, sessionId };
}

/**
 * A call that runs code or creates an object in an execution context: the daemon always picks the context, its own
 * isolated world, so a client may name none. A context id is not proof of a world: Chrome reuses ids across renderer
 * processes, so an id an isolated world had can name the page's own world after a cross-site navigation. A call on an
 * object (`Runtime.callFunctionOn` with `objectId`) runs where the object lives, an isolated world, since nothing else
 * hands out objects. A client's own `Page.createIsolatedWorld` still goes out: it only creates a world, whose id no call
 * may then name.
 */
function checkIsolated(request: CheckedRequest, contextParam: IsolatedCall['contextParam']): CdpRequestDecision {
    const { method, params, sessionId } = request;
    assert(sessionId != null, 'Only a session-level call needs an isolated world');
    if (params['contextId'] != null || params['executionContextId'] != null || params['uniqueContextId'] != null) {
        return reject(`${method}: code runs only in poweragents' own isolated world, so no context can be named`);
    }
    if (params['objectId'] != null && method === 'Runtime.callFunctionOn') {
        return forward(request);
    }
    return { type: 'isolate', call: { method, params, sessionId, contextParam } };
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

function isOwnSession(sessionId: unknown, context: CdpRequestContext) {
    if (typeof sessionId !== 'string') {
        return false;
    }
    const originator = context.ownership.getSessionOriginator(sessionId);
    return originator?.type === 'client' && originator.clientId === context.clientId;
}

function isOwnTarget(targetId: unknown, context: CdpRequestContext) {
    return typeof targetId === 'string' && context.ownership.getTargetOwner(targetId) === context.conversationId;
}

function isNoFiles(files: unknown) {
    return files == null || (Array.isArray(files) && files.length === 0);
}

function forward(request: CheckedRequest, params: CdpParams = request.params): CdpRequestDecision {
    return request.sessionId == null
        ? { type: 'forward', method: request.method, params }
        : { type: 'forward', method: request.method, params, sessionId: request.sessionId };
}

function reject(message: string): CdpRequestDecision {
    return { type: 'reject', message };
}
