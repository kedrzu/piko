import { mkdir, mkdtemp, readdir, readFile, rm, symlink } from 'node:fs/promises';
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
import { ChromiumInstall } from './ChromiumInstall.js';
import { FocusKeeper } from './FocusKeeper.js';

/**
 * These tests drive a real Chromium: Playwright's, which setup installs on every machine and CI runner. It runs headless
 * (no window on a dev Mac, no display on CI) and without the sandbox, which CI runners do not allow.
 */
const EXECUTABLE = chromium.executablePath();
const HEADLESS_ARGS = ['--headless=new', '--no-sandbox'];
const TIMEOUT_MS = 20_000;

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
    for (const cleanup of cleanups.splice(0).toReversed()) {
        await cleanup();
    }
});

test('pins downloads: each completed download lands in the data root under its name, never overwriting', async () => {
    const { browser, dataRoot, stateFolder } = await startBrowser();
    const sessionId = await openPage(browser);

    await download(browser, sessionId, 'report.txt', 'first');
    await download(browser, sessionId, 'report.txt', 'second');

    const folder = path.join(dataRoot, 'downloads');
    await waitUntil(async () => (await listFolder(folder)).length === 2, { timeoutMs: TIMEOUT_MS });
    expect(await readFile(path.join(folder, 'report.txt'), 'utf8')).toBe('first');
    expect(await readFile(path.join(folder, 'report (2).txt'), 'utf8')).toBe('second');
    await waitUntil(async () => (await listFolder(path.join(stateFolder, 'browser-downloads'))).length === 0, {
        timeoutMs: TIMEOUT_MS,
    });
}, 30_000);

test('a browser exit rejects pending calls, and the next start relaunches', async () => {
    const { browser, stateFolder } = await startBrowser();
    const sessionId = await openPage(browser);
    const exited = mock(() => {});
    browser.exited.on(exited);
    const pid = await readPid(stateFolder);

    const pending = browser.send(
        'Runtime.evaluate',
        { expression: 'new Promise(() => {})', awaitPromise: true },
        sessionId,
    );
    process.kill(pid, 'SIGKILL');

    await expect(pending).rejects.toThrow('The browser exited');
    await waitUntil(() => exited.mock.calls.length === 1, { timeoutMs: TIMEOUT_MS });
    expect(browser.isRunning()).toBe(false);
    await expect(browser.send('Browser.getVersion')).rejects.toThrow('The browser is not running');

    await browser.start();
    expect(browser.isRunning()).toBe(true);
    expect(await readPid(stateFolder)).not.toBe(pid);
    const version = await browser.send('Browser.getVersion');
    expect(isPlainObject(version) && typeof version['product']).toBe('string');
}, 30_000);

test('a launch stops a browser of an earlier run that still holds the profile', async () => {
    const first = await startBrowser();
    const stalePid = await readPid(first.stateFolder);

    const second = await startBrowser({ work: first.work });

    expect(second.browser.isRunning()).toBe(true);
    expect(isAlive(stalePid)).toBe(false);
    expect(await readPid(first.stateFolder)).not.toBe(stalePid);
}, 30_000);

test('the browser reaches loopback only through the proxy, which refuses it', async () => {
    let requests = 0;
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch() {
            requests++;
            return new Response('secret');
        },
    });
    cleanups.push(() => server.stop(true));
    const { browser } = await startBrowser();
    const sessionId = await openPage(browser);

    await browser.send('Page.navigate', { url: `http://127.0.0.1:${server.port}/` }, sessionId);
    await waitUntil(async () => (await evaluate(browser, sessionId, 'document.readyState')) === 'complete', {
        timeoutMs: TIMEOUT_MS,
    });

    expect(requests).toBe(0);
    expect(await evaluate(browser, sessionId, 'document.body.innerText')).not.toContain('secret');
}, 30_000);

test('ensureDownloadsFolder creates the folder and refuses a link', async () => {
    const { browser, dataRoot } = await startBrowser();

    await browser.ensureDownloadsFolder();
    expect(await listFolder(path.join(dataRoot, 'downloads'))).toEqual([]);
    await browser.ensureDownloadsFolder();

    await rm(path.join(dataRoot, 'downloads'), { recursive: true });
    await mkdir(path.join(dataRoot, 'elsewhere'));
    await symlink(path.join(dataRoot, 'elsewhere'), path.join(dataRoot, 'downloads'));
    await expect(browser.ensureDownloadsFolder()).rejects.toThrow('not a real folder');
}, 30_000);

test('start rejects while the browser is not installed', async () => {
    const { browser } = await startBrowser({ executable: null, launch: false });

    await expect(browser.start()).rejects.toThrow('The browser is not installed yet');
    expect(browser.isRunning()).toBe(false);
});

/** Options of `startBrowser`. */
interface StartBrowserOptions {
    /** A work folder of an earlier `startBrowser`, to share its profile. */
    work?: string;
    executable?: string | null;
    launch?: boolean;
}

async function startBrowser(options: StartBrowserOptions = {}) {
    const work = options.work ?? (await mkdtemp(path.join(os.tmpdir(), 'pa-browser-')));
    if (!options.work) {
        cleanups.push(() => rm(work, { recursive: true, force: true }));
    }
    const stateFolder = path.join(work, 'state');
    const dataRoot = path.join(work, 'data');

    const { container } = createTestContainer();
    const proxy = await container.resolve(BrowserNetworkGuard).listen(0);
    cleanups.push(() => proxy.close());
    const executable = options.executable === undefined ? EXECUTABLE : options.executable;
    container.set(EnvVariables, {
        PIKO_LIMA_HOME: path.join(stateFolder, 'lima'),
        PIKO_DATA_ROOT: dataRoot,
    });
    container.set(ChromiumInstall, { ensure: () => Promise.resolve(), getExecutable: () => executable });
    container.set(FocusKeeper, { start: mock(() => {}), restore: mock(() => {}) });
    container.set(BrowserLaunch, { proxyPort: proxy.port, extraArgs: HEADLESS_ARGS });

    const browser = container.resolve(BrowserService);
    if (options.launch !== false) {
        await browser.start();
        cleanups.push(() => killBrowser(stateFolder));
    }
    return { browser, work, stateFolder, dataRoot };
}

/** Creates a page, background and minimized, and attaches to it on the daemon's own channel; returns the session. */
async function openPage(browser: Resolved<typeof BrowserService>) {
    const created = await browser.send('Target.createTarget', {
        url: 'about:blank',
        background: true,
        newWindow: true,
        windowState: 'minimized',
    });
    const targetId = isPlainObject(created) ? created['targetId'] : undefined;
    if (typeof targetId !== 'string') {
        throw new TypeError('Target.createTarget gave no target id');
    }
    const reply = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const sessionId = isPlainObject(reply) ? reply['sessionId'] : undefined;
    if (typeof sessionId !== 'string') {
        throw new TypeError('Target.attachToTarget gave no session id');
    }
    return sessionId;
}

/** Makes the page download a file it builds itself, so no network is involved. */
async function download(browser: Resolved<typeof BrowserService>, sessionId: string, name: string, content: string) {
    const run = await browser.start();
    const finished = new Promise<void>((resolve, reject) => {
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
    const expression = `(() => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([${JSON.stringify(content)}]));
        link.download = ${JSON.stringify(name)};
        document.body.append(link);
        link.click();
        return 1;
    })()`;
    await browser.send('Runtime.evaluate', { expression, userGesture: true }, sessionId);
    await finished;
}

async function evaluate(browser: Resolved<typeof BrowserService>, sessionId: string, expression: string) {
    const reply = await browser.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
    const result = isPlainObject(reply) ? reply['result'] : undefined;
    return isPlainObject(result) ? result['value'] : undefined;
}

async function readPid(stateFolder: string) {
    return Number(await readFile(path.join(stateFolder, 'browser.pid'), 'utf8'));
}

async function killBrowser(stateFolder: string) {
    const pid = await readPid(stateFolder);
    if (isAlive(pid)) {
        process.kill(pid, 'SIGKILL');
        await waitUntil(() => !isAlive(pid), { timeoutMs: TIMEOUT_MS });
    }
}

async function listFolder(folder: string) {
    try {
        return await readdir(folder);
    } catch {
        return [];
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
