import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, mock, test } from 'bun:test';
import { chromium } from 'playwright';

import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import type { Resolved } from '@nzyme/ioc/Injectable.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { createSitePace } from '@nzyme/stealth-browser';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';
import { waitUntil } from '@nzyme/utils/waitUntil.js';

import { BrowserNetworkGuard } from './BrowserNetworkGuard.js';
import { BrowserPace } from './BrowserPace.js';
import { BrowserLaunch, BrowserService } from './BrowserService.js';
import { BrowserTunnelService } from './BrowserTunnelService.js';
import { ChromiumInstall } from './ChromiumInstall.js';
import { FocusKeeper } from './FocusKeeper.js';

/** A real headless Chromium, as in `BrowserService.test.ts`: Playwright's, which setup installs everywhere. */
const EXECUTABLE = chromium.executablePath();
const HEADLESS_ARGS = ['--headless=new', '--no-sandbox'];
const TIMEOUT_MS = 20_000;
const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';

/** A site the pace test loads: a page answered 403, a block, and an ordinary page of the same site. */
const SHOP_URL = 'https://shop.test/';
const SHOP_BLOCKED_URL = 'https://www.shop.test/blocked';
/** A plain page the tests serve themselves (`servePages`). */
const PLAIN_HTML = '<!doctype html><html><body><h1>Shop</h1></body></html>';
/** A page that writes the identity it reads at its first script to `#identity`. */
const BRAND_URL = 'https://brand.test/';
const BRAND_HTML = `<!doctype html><html><body><pre id="identity"></pre><script>
    const brands = navigator.userAgentData.brands.map(({ brand, version }) => ({ brand, version }));
    document.getElementById('identity').textContent = JSON.stringify(brands);
</script></body></html>`;

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
    const downloaded = waitForDownload(browser);
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

test('a browser exit closes every socket with 1011', async () => {
    const { port, stateFolder } = await startTunnel();
    const a = await connect(port, 'conv-a');
    const b = await connect(port, 'conv-b');
    await a.call('Browser.getVersion');

    process.kill(await readPid(stateFolder), 'SIGKILL');

    expect(await a.closed).toMatchObject({ code: 1011, reason: 'The browser exited' });
    expect(await b.closed).toMatchObject({ code: 1011, reason: 'The browser exited' });
}, 30_000);

test('a browser that fails to start closes the socket with 1011', async () => {
    const { port } = await startTunnel({ executable: '/nonexistent/chrome' });

    const client = await connect(port, 'conv-a');

    expect(await client.closed).toMatchObject({ code: 1011, reason: 'The browser could not start' });
}, 30_000);

test('what a socket sends while the browser starts is answered once it runs, in order', async () => {
    const { port, browser } = await startTunnel();
    const client = await connect(port, 'conv-a');
    expect(browser.isRunning()).toBe(false);

    const replies: string[] = [];
    const version = client.call('Browser.getVersion').then(() => replies.push('version'));
    const created = createTarget(client).then(targetId => {
        replies.push('created');
        return targetId;
    });
    const targets = client.call('Target.getTargets').then(reply => {
        replies.push('targets');
        return targetIdsOf(reply);
    });
    await version;

    expect(await targets).toEqual([await created]);
    expect(replies).toEqual(['version', 'created', 'targets']);
}, 30_000);

test('an upload takes files of /Poweragents only, staged in the order the agent sent them', async () => {
    const { port, dataRoot } = await startTunnel();
    await mkdir(path.join(dataRoot, 'projects'), { recursive: true });
    await writeFile(path.join(dataRoot, 'projects', 'first.txt'), 'first');
    await writeFile(path.join(dataRoot, 'projects', 'second.txt'), 'second');
    const client = await connect(port, 'conv-a');
    const sessionId = await attach(client, await createTarget(client));
    await evaluate(client, sessionId, "document.body.innerHTML = '<input type=file id=upload>'; 1");
    const document = await client.call('DOM.getDocument', {}, sessionId);
    const rootId = isPlainObject(document) && isPlainObject(document['root']) ? document['root']['nodeId'] : undefined;
    const found = await client.call('DOM.querySelector', { nodeId: rootId, selector: '#upload' }, sessionId);
    const nodeId = isPlainObject(found) ? found['nodeId'] : undefined;

    await expect(client.call('DOM.setFileInputFiles', { files: ['/etc/passwd'], nodeId }, sessionId)).rejects.toThrow(
        'only files inside /Poweragents can be uploaded',
    );
    await Promise.all([
        client.call('DOM.setFileInputFiles', { files: ['/Poweragents/projects/first.txt'], nodeId }, sessionId),
        client.call('DOM.setFileInputFiles', { files: ['/Poweragents/projects/second.txt'], nodeId }, sessionId),
    ]);

    expect(
        await evaluate(client, sessionId, "document.getElementById('upload').files[0].text()", { awaitPromise: true }),
    ).toBe('second');
}, 30_000);

test('the pace refuses a site that blocked the agent, in poweragents words, also after the browser relaunched', async () => {
    const { port, stateFolder } = await startTunnel({ pace: true });
    const message =
        'poweragents is pacing shop.test after it blocked or challenged the agent: the next action on it is possible in 5 min.';
    const client = await connect(port, 'conv-a');
    const sessionId = await attach(client, await createTarget(client));
    await servePages(client, sessionId, { [SHOP_BLOCKED_URL]: PLAIN_HTML }, { [SHOP_BLOCKED_URL]: 403 });
    await client.call('Network.enable', {}, sessionId);
    await navigate(client, sessionId, SHOP_BLOCKED_URL);

    await expect(client.call('Page.navigate', { url: SHOP_URL }, sessionId)).rejects.toThrow(message);

    process.kill(await readPid(stateFolder), 'SIGKILL');
    await client.closed;
    const next = await connect(port, 'conv-a');
    await expect(next.call('Target.createTarget', { url: SHOP_URL })).rejects.toThrow(message);
}, 30_000);

test('a page names itself Google Chrome, and a client cannot change the identity', async () => {
    const { port } = await startTunnel();
    const client = await connect(port, 'conv-a');
    const version = await client.call('Browser.getVersion');
    const product = isPlainObject(version) ? String(version['product']) : '';
    const major = product.replace(/^\w+\//, '').split('.')[0] ?? '';
    const sessionId = await attach(client, await createTarget(client));
    await servePages(client, sessionId, { [BRAND_URL]: BRAND_HTML });

    for (const method of ['Emulation.setUserAgentOverride', 'Network.setUserAgentOverride']) {
        await expect(client.call(method, { userAgent: 'Agent/1.0' }, sessionId)).rejects.toThrow(
            "the browser's identity is set by poweragents",
        );
    }
    await navigate(client, sessionId, BRAND_URL);

    const brands: unknown = JSON.parse(
        String(await evaluate(client, sessionId, "document.getElementById('identity').textContent")),
    );
    expect(brands).toContainEqual({ brand: 'Google Chrome', version: major });
}, 30_000);

test('bringToFront and the thumbnail take the conversation last-used page, a fresh popup included', async () => {
    const { port, browser, focusKeeper } = await startTunnel();
    const a = await connect(port, 'conv-a');
    const b = await connect(port, 'conv-b');
    const first = await createTarget(a);
    const firstSession = await attach(a, first);
    const second = await createTarget(a);
    const secondSession = await attach(a, second);
    const other = await createTarget(b);
    await evaluate(a, secondSession, "document.body.style.background = 'blue'; 1");
    await evaluate(a, firstSession, "document.body.style.background = 'red'; 1");

    const firstThumbnail = await browser.thumbnail('conv-a');
    expect(await browser.bringToFront('conv-a')).toBe(true);
    expect(await getWindowState(browser, first)).toBe('normal');
    expect(await getWindowState(browser, second)).toBe('minimized');
    expect(await getWindowState(browser, other)).toBe('minimized');
    await browser.putBack('conv-a');
    expect(await getWindowState(browser, first)).toBe('minimized');
    expect(focusKeeper.restore).toHaveBeenCalled();

    await evaluate(a, secondSession, '1');
    const secondThumbnail = await browser.thumbnail('conv-a');
    expect(firstThumbnail?.slice(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    expect(secondThumbnail?.slice(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    expect(Buffer.from(firstThumbnail ?? []).equals(Buffer.from(secondThumbnail ?? []))).toBe(false);

    const run = await browser.start();
    const restores = focusKeeper.restore.mock.calls.length;
    await evaluate(a, firstSession, "window.open('about:blank', '_blank', 'popup'); 1", { userGesture: true });
    await waitUntil(() => run.groups.targets('conv-a').length === 3, { timeoutMs: TIMEOUT_MS });
    const popup = run.groups.targets('conv-a').find(targetId => targetId !== first && targetId !== second) ?? '';
    await waitUntil(() => focusKeeper.restore.mock.calls.length > restores, { timeoutMs: TIMEOUT_MS });
    expect(await getWindowState(browser, popup)).toBe('minimized');

    expect(await browser.bringToFront('conv-a')).toBe(true);
    expect(await getWindowState(browser, popup)).toBe('normal');
    expect(await getWindowState(browser, first)).toBe('minimized');
    expect(await browser.bringToFront('nobody')).toBe(false);
    expect(await browser.thumbnail('nobody')).toBeNull();
}, 30_000);

/** Options of `startTunnel`. */
interface StartTunnelOptions {
    executable?: string | null;
    /** Holds sites to the real pace; without it every command goes at once, so tests load pages back to back. */
    pace?: boolean;
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
    const focusKeeper = { start: mock(() => {}), restore: mock(() => {}) };
    container.set(FocusKeeper, focusKeeper);
    container.set(BrowserLaunch, { proxyPort: proxy.port, extraArgs: HEADLESS_ARGS });
    if (!options.pace) {
        container.set(BrowserPace, createSitePace({ intervalMs: 0 }));
    }

    const browser = container.resolve(BrowserService);
    const tunnel = container.resolve(BrowserTunnelService).listen(0);
    cleanups.push(() => killBrowser(stateFolder));
    cleanups.push(() => tunnel.close());
    return {
        port: tunnel.port,
        browser,
        focusKeeper,
        stateFolder,
        dataRoot: path.join(work, 'data'),
        tokenFile,
        ensureCalls: () => ensured,
    };
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
 * Intercepts the page's requests on `sessionId` with `Fetch` and answers each from `pages` by URL, with its status
 * from `statuses` (200 by default), a 404 the rest; enables Page for its load events.
 */
async function servePages(
    client: TestClient,
    sessionId: string,
    pages: Record<string, string>,
    statuses: Record<string, number> = {},
) {
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
        const pausedOn = typeof message['sessionId'] === 'string' ? message['sessionId'] : sessionId;
        const url = isPlainObject(request) ? request['url'] : undefined;
        const html = typeof url === 'string' && Object.hasOwn(pages, url) ? pages[url] : undefined;
        const status = typeof url === 'string' ? statuses[url] : undefined;
        void client.call(
            'Fetch.fulfillRequest',
            {
                requestId,
                responseCode: html == null ? 404 : (status ?? 200),
                responseHeaders: [
                    {
                        name: 'Content-Type',
                        value: typeof url === 'string' && url.endsWith('.js') ? 'text/javascript' : 'text/html',
                    },
                ],
                body: Buffer.from(html ?? '').toString('base64'),
            },
            pausedOn,
        );
    });
    await client.call('Fetch.enable', { patterns: [{ urlPattern: 'https://*.test*' }] }, sessionId);
    await client.call('Page.enable', {}, sessionId);
}

async function navigate(client: TestClient, sessionId: string, url: string) {
    const loads = client.messages.filter(m => m['method'] === 'Page.loadEventFired').length;
    await client.call('Page.navigate', { url }, sessionId);
    await waitUntil(() => client.messages.filter(m => m['method'] === 'Page.loadEventFired').length > loads, {
        timeoutMs: TIMEOUT_MS,
    });
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

async function getWindowState(browser: Resolved<typeof BrowserService>, targetId: string) {
    const reply = await browser.send('Browser.getWindowForTarget', { targetId });
    const bounds = isPlainObject(reply) ? reply['bounds'] : undefined;
    return isPlainObject(bounds) ? bounds['windowState'] : undefined;
}

/** Resolves once a download of the running browser completed. */
async function waitForDownload(browser: Resolved<typeof BrowserService>) {
    const run = await browser.start();
    return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('No completed download')), TIMEOUT_MS);
        const unsubscribe = run.onEvent(event => {
            if (
                event.method === 'Browser.downloadProgress' &&
                isPlainObject(event.params) &&
                event.params['state'] === 'completed'
            ) {
                clearTimeout(timer);
                unsubscribe();
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
