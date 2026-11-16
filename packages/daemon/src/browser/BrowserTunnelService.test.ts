import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, mock, test } from 'bun:test';
import { chromium } from 'playwright';

import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import type { Resolved } from '@nzyme/ioc/Injectable.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';
import { waitUntil } from '@nzyme/utils/waitUntil.js';

import { BrowserNetworkGuard } from './BrowserNetworkGuard.js';
import { BrowserLaunch, BrowserService } from './BrowserService.js';
import { BrowserTunnelService } from './BrowserTunnelService.js';
import { ChromiumInstall } from './ChromiumInstall.js';
import { FocusKeeper } from './FocusKeeper.js';

/** A real headless Chromium, as in `BrowserService.test.ts`: Playwright's, which setup installs everywhere. */
const EXECUTABLE = chromium.executablePath();
const HEADLESS_ARGS = ['--headless=new', '--no-sandbox'];
const TIMEOUT_MS = 20_000;
const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';

/** Pages the client serves itself through `Fetch` (`servePages`), so they never reach the network. */
const DETECTOR_URL = 'https://detector.test/';
/** The detector with two frames: one of its own origin, and one of another origin of its site, hence its process. */
const FRAMES_URL = 'https://detector.test/frames';
const SAME_ORIGIN_FRAME_URL = 'https://detector.test/frame';
const CROSS_ORIGIN_FRAME_URL = 'https://detector.test:8443/frame';
const WORKER_URL = 'https://detector.test/worker';
/**
 * The page's own detector, after rebrowser's bot-detector: an Error logged with `console.debug` is serialised only
 * while Runtime is enabled, which formats its stack through `Error.prepareStackTrace`. (Its `name` is read either
 * way, by Chrome's own console logging, so a getter on it detects nothing.) It also
 * looks for the globals the client's code sets and counts main-world `querySelector` calls, and writes what it saw to
 * the DOM, where the client reads it.
 */
const DETECTOR_HTML = detectorHtml('');
/** A framed page's own detector: whether the client's global reached the frame's world, in `#mark`. */
const FRAME_HTML = `<!doctype html><html><body><p id="mark"></p><script>
    setInterval(() => { document.getElementById('mark').textContent = '__fnMark' in window ? 'seen' : 'clean'; }, 50);
</script></body></html>`;
/** A page with a worker; what the worker posts lands in `data-worker`: `alive` at start, `reached` if code reaches it. */
const WORKER_HTML = `<!doctype html><html><body><script>
    const worker = new Worker(URL.createObjectURL(new Blob(["postMessage('alive'); self.reach = () => postMessage('reached');"])));
    worker.onmessage = event => { document.body.dataset.worker = event.data; };
</script></body></html>`;

/** The detector page, with `body` after it. */
function detectorHtml(body: string) {
    return `<!doctype html><html><body><h1>Detector</h1><pre id="detections"></pre>${body}<script>
    const detections = { runtime: 0, globals: [], querySelector: 0 };
    const querySelector = Document.prototype.querySelector;
    Document.prototype.querySelector = function (...args) { detections.querySelector++; return querySelector.apply(this, args); };
    Error.prepareStackTrace = (error, frames) => { detections.runtime++; return 'stack'; };
    setInterval(() => {
        console.debug(new Error('probe'));
        detections.globals = ['__agentMark', '__initMark', '__loadMark', '__fnMark', '__agentBinding'].filter(
            name => name in window,
        );
        document.getElementById('detections').textContent = JSON.stringify(detections);
    }, 50);
</script></body></html>`;
}

/** What `DETECTOR_HTML` writes to its page. */
interface DetectorFindings {
    /** How often a logged Error's stack was formatted: above 0 only while Runtime is enabled. */
    runtime: number;
    /** The client's globals the page can see. */
    globals: string[];
    /** Main-world `document.querySelector` calls. */
    querySelector: number;
}

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
    for (const cleanup of cleanups.splice(0).toReversed()) {
        await cleanup();
    }
});

test('an upgrade without the right token, with an Origin or on another path is refused', async () => {
    const { port } = await startTunnel();
    const good = { authorization: `Bearer ${TOKEN}` };

    expect(await upgrade(port, '/session/ses_a', {})).toBe(401);
    expect(await upgrade(port, '/session/ses_a', { authorization: `Bearer ${TOKEN.replace('a', 'b')}` })).toBe(401);
    expect(await upgrade(port, '/session/ses_a', { authorization: `Bearer ${TOKEN}x` })).toBe(401);
    expect(await upgrade(port, '/session/ses_a', { authorization: TOKEN })).toBe(401);
    expect(await upgrade(port, '/session/ses_a', { ...good, origin: 'http://localhost' })).toBe(403);
    expect(await upgrade(port, '/session/ses_a', { ...good, origin: 'null' })).toBe(403);
    for (const badPath of [
        '/',
        '/json/version',
        '/session/',
        '/session/a/b',
        '/session/a.b',
        `/session/${'a'.repeat(129)}`,
    ]) {
        expect(await upgrade(port, badPath, good)).toBe(403);
    }
    expect(await upgrade(port, '/session/ses_e24fb6424ffeM80UBg8atOKbIg', good)).toBe(101);
});

test('an upgrade is refused while the token file is missing or holds no valid token', async () => {
    const { port, tokenFile } = await startTunnel();
    const good = { authorization: `Bearer ${TOKEN}` };

    await rm(tokenFile);
    expect(await upgrade(port, '/session/ses_a', good)).toBe(401);
    await writeFile(tokenFile, `${TOKEN}\n`);
    expect(await upgrade(port, '/session/ses_a', { authorization: `Bearer ${TOKEN}\n` })).toBe(401);
    await writeFile(tokenFile, '');
    expect(await upgrade(port, '/session/ses_a', { authorization: 'Bearer ' })).toBe(401);
});

test('before the browser is installed an upgrade is refused with 503 and the download is retried', async () => {
    const { port, ensureCalls } = await startTunnel({ executable: null });

    const response = await fetch(`http://127.0.0.1:${port}/session/ses_a`, {
        headers: { ...upgradeHeaders(), authorization: `Bearer ${TOKEN}` },
    });

    expect(response.status).toBe(503);
    expect(await response.text()).toContain('still being prepared');
    expect(ensureCalls()).toBe(1);
});

test('clients of two conversations see and drive only their own pages and sessions', async () => {
    const { port } = await startTunnel();
    const a = await connect(port, 'conv-a');
    const b = await connect(port, 'conv-b');
    await a.call('Target.setDiscoverTargets', { discover: true });
    await b.call('Target.setDiscoverTargets', { discover: true });

    const targetA = await createTarget(a);
    const targetB = await createTarget(b);
    const sessionA = await attach(a, targetA);
    await a.call('Page.enable', {}, sessionA);

    expect(targetIdsOf(await a.call('Target.getTargets'))).toEqual([targetA]);
    expect(targetIdsOf(await b.call('Target.getTargets'))).toEqual([targetB]);
    await expect(a.call('Target.attachToTarget', { targetId: targetB, flatten: true })).rejects.toThrow(
        'unknown target',
    );
    await expect(a.call('Target.closeTarget', { targetId: targetB })).rejects.toThrow('unknown target');
    await expect(b.call('Runtime.evaluate', { expression: '1' }, sessionA)).rejects.toThrow('unknown session');

    expect(createdTargets(a)).toEqual([targetA]);
    expect(createdTargets(b)).toEqual([targetB]);
    expect(mentions(b, targetA)).toBe(false);
    expect(mentions(b, sessionA)).toBe(false);
    expect(mentions(a, targetB)).toBe(false);
}, 30_000);

test('a second socket of the conversation sees its pages but not the sessions of the first', async () => {
    const { port } = await startTunnel();
    const first = await connect(port, 'conv-a');
    const targetId = await createTarget(first);
    const firstSession = await attach(first, targetId);
    await first.call('Page.enable', {}, firstSession);

    const second = await connect(port, 'conv-a');
    await second.call('Target.setDiscoverTargets', { discover: true });
    await first.call('Page.navigate', { url: 'about:blank' }, firstSession);

    expect(createdTargets(second)).toEqual([targetId]);
    expect(targetIdsOf(await second.call('Target.getTargets'))).toEqual([targetId]);
    await expect(second.call('Runtime.evaluate', { expression: '1' }, firstSession)).rejects.toThrow('unknown session');
    const secondSession = await attach(second, targetId);
    expect(await evaluate(second, secondSession, '6 * 7')).toBe(42);
    expect(mentions(second, firstSession)).toBe(false);
    expect(mentions(first, secondSession)).toBe(false);
}, 30_000);

test('a client drives its page; the daemon own sessions and browser-level events never reach it', async () => {
    const { port, browser } = await startTunnel();
    const client = await connect(port, 'conv-a');
    await client.call('Target.setDiscoverTargets', { discover: true });
    const targetId = await createTarget(client);
    const sessionId = await attach(client, targetId);
    await client.call('Page.enable', {}, sessionId);

    await client.call('Page.navigate', { url: 'about:blank' }, sessionId);
    await waitUntil(() => client.messages.some(m => m['method'] === 'Page.loadEventFired'), { timeoutMs: TIMEOUT_MS });
    expect(await evaluate(client, sessionId, '1 + 1')).toBe(2);
    expect(client.messages.find(m => m['method'] === 'Page.loadEventFired')?.['sessionId']).toBe(sessionId);

    await browser.thumbnail('conv-a');
    const downloaded = waitForBrowserEvent(browser, 'Browser.downloadProgress');
    await evaluate(
        client,
        sessionId,
        `(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['x']));
        a.download = 'x.txt'; document.body.append(a); a.click(); return 1; })()`,
        { userGesture: true },
    );
    await downloaded;
    await client.call('Browser.getVersion');

    const attached = client.messages.filter(m => m['method'] === 'Target.attachedToTarget');
    expect(attached.map(m => (isPlainObject(m['params']) ? m['params']['sessionId'] : undefined))).toEqual([sessionId]);
    expect(client.messages.some(m => typeof m['method'] === 'string' && m['method'].startsWith('Browser.'))).toBe(
        false,
    );
    await expect(client.call('Browser.close')).rejects.toThrow('not allowed');
}, 30_000);

test('a page script sees no enabled Runtime and nothing the client runs, while the client reads the page', async () => {
    const { port, browser } = await startTunnel();
    const client = await connect(port, 'conv-a');
    const targetId = await createTarget(client);
    const sessionId = await attach(client, targetId);
    await servePages(client, sessionId, { [DETECTOR_URL]: DETECTOR_HTML });

    // What agent-browser sends: the enables, an init script, a binding, then evaluation in every form.
    await client.call('Runtime.enable', {}, sessionId);
    await client.call('Console.enable', {}, sessionId);
    await client.call('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__initMark = 1;' }, sessionId);
    await client.call('Page.addScriptToEvaluateOnLoad', { scriptSource: 'window.__loadMark = 1;' }, sessionId);
    await client.call('Runtime.addBinding', { name: '__agentBinding' }, sessionId);
    await navigate(client, sessionId, DETECTOR_URL);
    expect(await evaluate(client, sessionId, "window.__agentMark = 1; document.querySelector('h1').textContent")).toBe(
        'Detector',
    );
    expect(await evaluate(client, sessionId, '[window.__initMark, window.__loadMark]')).toEqual([1, 1]);
    const tree = await client.call('DOM.getDocument', {}, sessionId);
    const root = isPlainObject(tree) && isPlainObject(tree['root']) ? tree['root']['nodeId'] : undefined;
    const found = await client.call('DOM.querySelector', { nodeId: root, selector: 'h1' }, sessionId);
    const resolved = await client.call(
        'DOM.resolveNode',
        { nodeId: isPlainObject(found) ? found['nodeId'] : undefined },
        sessionId,
    );
    const objectId =
        isPlainObject(resolved) && isPlainObject(resolved['object']) ? resolved['object']['objectId'] : null;
    const called = await client.call(
        'Runtime.callFunctionOn',
        {
            objectId,
            functionDeclaration: 'function () { window.__fnMark = 1; return this.tagName; }',
            returnByValue: true,
        },
        sessionId,
    );
    expect(isPlainObject(called) && isPlainObject(called['result']) ? called['result']['value'] : null).toBe('H1');
    // No context id is taken from the client, not even one of a world it created: ids are reused across processes.
    const frameTree = await client.call('Page.getFrameTree', {}, sessionId);
    const frame =
        isPlainObject(frameTree) && isPlainObject(frameTree['frameTree']) ? frameTree['frameTree']['frame'] : undefined;
    const world = await client.call(
        'Page.createIsolatedWorld',
        { frameId: isPlainObject(frame) ? frame['id'] : undefined, worldName: 'own' },
        sessionId,
    );
    const ownContextId = isPlainObject(world) ? world['executionContextId'] : undefined;
    expect(typeof ownContextId).toBe('number');
    for (const contextId of [1, ownContextId]) {
        await expect(client.call('Runtime.evaluate', { expression: '1', contextId }, sessionId)).rejects.toThrow(
            'no context can be named',
        );
    }

    // A navigation in between: the next evaluation lands in the new document's world, where the init script ran.
    await navigate(client, sessionId, DETECTOR_URL);
    expect(await evaluate(client, sessionId, '[window.__initMark, typeof window.__agentMark]')).toEqual([
        1,
        'undefined',
    ]);
    await Bun.sleep(300);
    const clean: DetectorFindings = { runtime: 0, globals: [], querySelector: 0 };
    expect(await readDetections(client, sessionId)).toEqual(clean);

    // The control: the detector does catch an enabled Runtime, here enabled by the daemon past the tunnel.
    const reply = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    await browser.send('Runtime.enable', {}, isPlainObject(reply) ? String(reply['sessionId']) : undefined);
    await waitUntil(async () => isDetected(await readDetections(client, sessionId)), {
        timeoutMs: TIMEOUT_MS,
    });
}, 30_000);

test('a node of a framed page resolves into its own frame, out of reach of every page script', async () => {
    const { port } = await startTunnel();
    const client = await connect(port, 'conv-a');
    const targetId = await createTarget(client);
    const sessionId = await attach(client, targetId);
    await servePages(client, sessionId, {
        [FRAMES_URL]: detectorHtml(`<iframe src="/frame"></iframe><iframe src="${CROSS_ORIGIN_FRAME_URL}"></iframe>`),
        [SAME_ORIGIN_FRAME_URL]: FRAME_HTML,
        [CROSS_ORIGIN_FRAME_URL]: FRAME_HTML,
    });
    await navigate(client, sessionId, FRAMES_URL);

    // agent-browser's refs: a backendNodeId, resolved with no context, then a function called on the object.
    const tree = await client.call('DOM.getDocument', { depth: -1, pierce: true }, sessionId);
    const marks = findNodes(isPlainObject(tree) ? tree['root'] : undefined, node => {
        const attributes = node['attributes'];
        return Array.isArray(attributes) && attributes[0] === 'id' && attributes[1] === 'mark';
    });
    expect(marks).toHaveLength(2);
    const seen: unknown[] = [];
    for (const backendNodeId of marks) {
        seen.push(
            await callOnNode(
                client,
                sessionId,
                backendNodeId,
                'function () { window.__fnMark = 1; return document.URL; }',
            ),
        );
    }
    expect(seen).toEqual([SAME_ORIGIN_FRAME_URL, CROSS_ORIGIN_FRAME_URL]);

    await Bun.sleep(300);
    const marked: unknown[] = [];
    for (const backendNodeId of marks) {
        marked.push(await callOnNode(client, sessionId, backendNodeId, 'function () { return this.textContent; }'));
    }
    expect(marked).toEqual(['clean', 'clean']);
    const clean: DetectorFindings = { runtime: 0, globals: [], querySelector: 0 };
    expect(await readDetections(client, sessionId)).toEqual(clean);
}, 30_000);

test("code sent to a worker's session never reaches the worker", async () => {
    const { port } = await startTunnel();
    const client = await connect(port, 'conv-a');
    const targetId = await createTarget(client);
    const sessionId = await attach(client, targetId);
    await servePages(client, sessionId, { [WORKER_URL]: WORKER_HTML });
    await navigate(client, sessionId, WORKER_URL);
    await waitUntil(async () => (await evaluate(client, sessionId, 'document.body.dataset.worker')) === 'alive', {
        timeoutMs: TIMEOUT_MS,
    });

    await client.call(
        'Target.setAutoAttach',
        { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
        sessionId,
    );
    await waitUntil(() => findWorkerSession(client) != null, { timeoutMs: TIMEOUT_MS });
    const workerSession = findWorkerSession(client);
    await expect(client.call('Runtime.evaluate', { expression: 'reach()' }, workerSession)).rejects.toThrow(
        'cannot run in a worker',
    );

    await Bun.sleep(300);
    expect(await evaluate(client, sessionId, 'document.body.dataset.worker')).toBe('alive');
}, 30_000);

test('a closed socket detaches its sessions and leaves its pages', async () => {
    const { port, browser } = await startTunnel();
    const client = await connect(port, 'conv-a');
    const targetId = await createTarget(client);
    const sessionId = await attach(client, targetId);
    expect(browser.ownership.getSessionOriginator(sessionId)?.type).toBe('client');

    client.socket.close();

    await waitUntil(() => browser.ownership.getSessionOriginator(sessionId) == null, { timeoutMs: TIMEOUT_MS });
    expect(browser.ownership.getTargets('conv-a')).toEqual([targetId]);
}, 30_000);

test('a browser exit closes every socket', async () => {
    const { port, stateFolder } = await startTunnel();
    const a = await connect(port, 'conv-a');
    const b = await connect(port, 'conv-b');
    await a.call('Browser.getVersion');

    process.kill(await readPid(stateFolder), 'SIGKILL');

    expect((await a.closed).reason).toBe('The browser exited');
    expect((await b.closed).reason).toBe('The browser exited');
}, 30_000);

/** Options of `startTunnel`. */
interface StartTunnelOptions {
    executable?: string | null;
}

async function startTunnel(options: StartTunnelOptions = {}) {
    const work = await mkdtemp(path.join(os.tmpdir(), 'pa-tunnel-'));
    cleanups.push(() => rm(work, { recursive: true, force: true }));
    const stateFolder = path.join(work, 'state');
    const tokenFile = path.join(stateFolder, 'browser-token');
    await mkdir(stateFolder, { recursive: true });
    await writeFile(tokenFile, TOKEN);

    const { container } = createTestContainer();
    const proxy = await container.resolve(BrowserNetworkGuard).listen(0);
    cleanups.push(() => proxy.close());
    const executable = options.executable === undefined ? EXECUTABLE : options.executable;
    container.set(EnvVariables, {
        POWERAGENTS_LIMA_HOME: path.join(stateFolder, 'lima'),
        POWERAGENTS_DATA_ROOT: path.join(work, 'data'),
    });
    let ensured = 0;
    container.set(ChromiumInstall, {
        ensure: () => {
            ensured++;
            return Promise.resolve();
        },
        getExecutable: () => executable,
    });
    container.set(FocusKeeper, { start: mock(() => {}), restore: mock(() => {}) });
    container.set(BrowserLaunch, { proxyPort: proxy.port, extraArgs: HEADLESS_ARGS });

    const browser = container.resolve(BrowserService);
    const tunnel = container.resolve(BrowserTunnelService).listen(0);
    cleanups.push(() => killBrowser(stateFolder));
    cleanups.push(() => tunnel.close());
    return { port: tunnel.port, browser, stateFolder, tokenFile, ensureCalls: () => ensured };
}

/** A tunnel client as agent-browser is one: a WebSocket with the bearer token and no Origin. */
interface TestClient {
    socket: WebSocket;
    /** Every message the tunnel sent, parsed. */
    messages: Record<string, unknown>[];
    /** Sends a command; resolves with its result, rejects with its error message. */
    call(method: string, params?: object, sessionId?: string): Promise<unknown>;
    closed: Promise<CloseEvent>;
}

async function connect(port: number, conversationId: string): Promise<TestClient> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/session/${conversationId}`, {
        headers: { authorization: `Bearer ${TOKEN}` },
    });
    const messages: Record<string, unknown>[] = [];
    const pending = new Map<number, { resolve(result: unknown): void; reject(error: Error): void }>();
    let lastId = 0;
    socket.addEventListener('message', event => {
        const message: unknown = JSON.parse(String(event.data));
        if (!isPlainObject(message)) {
            return;
        }
        messages.push(message);
        const id = message['id'];
        const call = typeof id === 'number' ? pending.get(id) : undefined;
        if (!call) {
            return;
        }
        const error = message['error'];
        if (isPlainObject(error)) {
            call.reject(new Error(String(error['message'])));
        } else {
            call.resolve(message['result']);
        }
    });
    const closed = new Promise<CloseEvent>(resolve => {
        socket.addEventListener('close', resolve);
    });
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve);
        socket.addEventListener('error', reject);
    });
    cleanups.push(() => socket.close());

    return {
        socket,
        messages,
        closed,
        call(method, params, sessionId) {
            const id = ++lastId;
            return new Promise((resolve, reject) => {
                pending.set(id, { resolve, reject });
                socket.send(JSON.stringify({ id, method, params: params ?? {}, sessionId }));
            });
        },
    };
}

/** The status of a WebSocket upgrade request: 101 when accepted. */
async function upgrade(port: number, pathname: string, headers: Record<string, string>) {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
        headers: { ...upgradeHeaders(), ...headers },
    });
    return response.status;
}

function upgradeHeaders() {
    return {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': Buffer.from('0123456789abcdef').toString('base64'),
    };
}

async function createTarget(client: TestClient) {
    const reply = await client.call('Target.createTarget', { url: 'about:blank' });
    const targetId = isPlainObject(reply) ? reply['targetId'] : undefined;
    if (typeof targetId !== 'string') {
        throw new TypeError('Target.createTarget gave no target id');
    }
    return targetId;
}

async function attach(client: TestClient, targetId: string) {
    const reply = await client.call('Target.attachToTarget', { targetId, flatten: true });
    const sessionId = isPlainObject(reply) ? reply['sessionId'] : undefined;
    if (typeof sessionId !== 'string') {
        throw new TypeError('Target.attachToTarget gave no session id');
    }
    return sessionId;
}

async function evaluate(client: TestClient, sessionId: string, expression: string, extra: object = {}) {
    const reply = await client.call('Runtime.evaluate', { expression, returnByValue: true, ...extra }, sessionId);
    const result = isPlainObject(reply) ? reply['result'] : undefined;
    return isPlainObject(result) ? result['value'] : undefined;
}

/**
 * Intercepts the page's requests on `sessionId` with `Fetch` and answers each from `pages` by URL, a 404 the rest;
 * enables Page for its load events.
 */
async function servePages(client: TestClient, sessionId: string, pages: Record<string, string>) {
    client.socket.addEventListener('message', event => {
        const message: unknown = JSON.parse(String(event.data));
        if (
            !isPlainObject(message) ||
            message['method'] !== 'Fetch.requestPaused' ||
            !isPlainObject(message['params'])
        ) {
            return;
        }
        const { requestId, request } = message['params'];
        const url = isPlainObject(request) ? request['url'] : undefined;
        const html = typeof url === 'string' && Object.hasOwn(pages, url) ? pages[url] : undefined;
        void client.call(
            'Fetch.fulfillRequest',
            {
                requestId,
                responseCode: html == null ? 404 : 200,
                responseHeaders: [{ name: 'Content-Type', value: 'text/html' }],
                body: Buffer.from(html ?? '').toString('base64'),
            },
            sessionId,
        );
    });
    await client.call('Fetch.enable', { patterns: [{ urlPattern: 'https://detector.test*' }] }, sessionId);
    await client.call('Page.enable', {}, sessionId);
}

/** Resolves a node as agent-browser does, with no context, and calls `functionDeclaration` on it; its value. */
async function callOnNode(client: TestClient, sessionId: string, backendNodeId: number, functionDeclaration: string) {
    const resolved = await client.call('DOM.resolveNode', { backendNodeId }, sessionId);
    const objectId =
        isPlainObject(resolved) && isPlainObject(resolved['object']) ? resolved['object']['objectId'] : undefined;
    const called = await client.call(
        'Runtime.callFunctionOn',
        { objectId, functionDeclaration, returnByValue: true },
        sessionId,
    );
    return isPlainObject(called) && isPlainObject(called['result']) ? called['result']['value'] : undefined;
}

/** The backendNodeIds of the nodes `matches` picks in a `DOM.getDocument` tree, frames' documents included. */
function findNodes(root: unknown, matches: (node: Record<string, unknown>) => boolean) {
    const found: number[] = [];
    const pending: unknown[] = [root];
    while (pending.length > 0) {
        const node = pending.shift();
        if (!isPlainObject(node)) {
            continue;
        }
        if (matches(node) && typeof node['backendNodeId'] === 'number') {
            found.push(node['backendNodeId']);
        }
        const children = node['children'];
        if (Array.isArray(children)) {
            const list: readonly unknown[] = children;
            pending.push(...list);
        }
        pending.push(node['contentDocument']);
    }
    return found;
}

/** The session a client was auto-attached to a worker on. */
function findWorkerSession(client: TestClient) {
    for (const message of client.messages) {
        const params = message['params'];
        if (
            message['method'] === 'Target.attachedToTarget' &&
            isPlainObject(params) &&
            isPlainObject(params['targetInfo']) &&
            params['targetInfo']['type'] === 'worker' &&
            typeof params['sessionId'] === 'string'
        ) {
            return params['sessionId'];
        }
    }
    return undefined;
}

async function navigate(client: TestClient, sessionId: string, url: string) {
    const loads = client.messages.filter(m => m['method'] === 'Page.loadEventFired').length;
    await client.call('Page.navigate', { url }, sessionId);
    await waitUntil(() => client.messages.filter(m => m['method'] === 'Page.loadEventFired').length > loads, {
        timeoutMs: TIMEOUT_MS,
    });
}

/** What the detector page last wrote; `null` before it wrote anything. */
async function readDetections(client: TestClient, sessionId: string) {
    const text = await evaluate(client, sessionId, "document.getElementById('detections').textContent");
    if (typeof text !== 'string' || text === '') {
        return null;
    }
    const findings: unknown = JSON.parse(text);
    return findings;
}

function isDetected(findings: unknown) {
    return isPlainObject(findings) && typeof findings['runtime'] === 'number' && findings['runtime'] > 0;
}

function targetIdsOf(reply: unknown) {
    const infos = isPlainObject(reply) && Array.isArray(reply['targetInfos']) ? reply['targetInfos'] : [];
    return infos.map((info: unknown) => (isPlainObject(info) ? info['targetId'] : undefined));
}

/** The targets a client was told were created, in order. */
function createdTargets(client: TestClient) {
    return client.messages
        .filter(m => m['method'] === 'Target.targetCreated')
        .map(m =>
            isPlainObject(m['params']) && isPlainObject(m['params']['targetInfo'])
                ? m['params']['targetInfo']['targetId']
                : undefined,
        );
}

/** Whether any event a client got names `id` (a target or a session) anywhere; replies echo what the client sent. */
function mentions(client: TestClient, id: string) {
    return client.messages.some(m => m['method'] != null && JSON.stringify(m).includes(id));
}

function waitForBrowserEvent(browser: Resolved<typeof BrowserService>, method: string) {
    return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`No ${method}`)), TIMEOUT_MS);
        browser.event.on(function listener(event) {
            if (event.method === method && isPlainObject(event.params) && event.params['state'] === 'completed') {
                clearTimeout(timer);
                browser.event.off(listener);
                resolve();
            }
        });
    });
}

async function readPid(stateFolder: string) {
    return Number(await readFile(path.join(stateFolder, 'browser.pid'), 'utf8'));
}

async function killBrowser(stateFolder: string) {
    const pid = await readPid(stateFolder).catch(() => null);
    if (pid != null && isAlive(pid)) {
        process.kill(pid, 'SIGKILL');
        await waitUntil(() => !isAlive(pid), { timeoutMs: TIMEOUT_MS });
    }
}

function isAlive(pid: number) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}
