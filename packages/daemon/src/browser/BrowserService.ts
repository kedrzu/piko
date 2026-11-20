import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { defineInterface } from '@nzyme/ioc/Interface.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { launchStealthBrowser } from '@nzyme/stealth-browser';
import type { CdpEvent, StealthBrowser } from '@nzyme/stealth-browser';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';
import type { EventEmitter } from '@nzyme/utils/createEventEmitter.js';
import { createSingleRunner } from '@nzyme/utils/createSingleRunner.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';
import { waitUntil } from '@nzyme/utils/waitUntil.js';
import { withTimeout } from '@nzyme/utils/withTimeout.js';

import { BROWSER_PROXY_PORT, DOWNLOADS_FOLDER, PIKO_DATA_ROOT, PIKO_LIMA_HOME } from '../env.js';
import { isErrorCode } from '../utils/isErrorCode.js';
import { isRealFolder } from '../utils/isRealFolder.js';
import { BrowserPace } from './BrowserPace.js';
import { buildChromiumArgs } from './buildChromiumArgs.js';
import { checkProductRequest } from './checkProductRequest.js';
import type { ProductClientData } from './checkProductRequest.js';
import { ChromiumInstall } from './ChromiumInstall.js';
import { FocusKeeper } from './FocusKeeper.js';
import { moveDownload } from './moveDownload.js';

/** One run of the agent's browser, which tunnel clients connect to with their conversation as the group. */
export type AgentBrowser = StealthBrowser<ProductClientData>;

/**
 * The agent's one browser (ADR `docs/decisions/agent-browser-over-one-pipe.md`): a Chrome for Testing launched with no
 * window by `@nzyme/stealth-browser`, which drives it over `--remote-debugging-pipe`, so no other local process can
 * reach it, keeps each conversation to its own pages and names every page and worker Google Chrome. Each run judges
 * every client command with `checkProductRequest` and holds every site to the one `BrowserPace`. Popups are minimized
 * at once, and downloads land in the data root's Downloads folder.
 */
export interface BrowserServiceShape {
    /**
     * Launches the browser unless it runs, and resolves with the run once downloads are pinned, so nothing reaches the
     * browser before it is configured. Calls made meanwhile join the launch. Rejects while the browser is not
     * installed, or when the launch fails; the next call tries again.
     */
    start(): Promise<AgentBrowser>;
    /** Whether a started browser is up; `false` again once it exits. */
    isRunning(): boolean;
    /**
     * Sends a CDP command on the daemon's own channel, which no client sees, to a session when `sessionId` is given;
     * resolves with its unchecked `result`. Rejects with `CdpError` when the browser answers with an error, and with a
     * plain `Error` while the browser is not running or when it exits before answering.
     */
    send(method: string, params?: object, sessionId?: string): Promise<unknown>;
    /** The browser exited: pending calls were rejected and every client's socket closed. */
    exited: EventEmitter<[]>;
    /**
     * Brings the conversation's last-used page (a popup it just opened, or its newest page when nothing was used yet) to
     * the front: its window is restored from minimized and the browser activated, for when the person must step in.
     * Never touches another conversation's window. Resolves `false`, doing nothing, when the conversation has no page or
     * the browser is not running.
     */
    bringToFront(conversationId: string): Promise<boolean>;
    /** Minimizes the conversation's last-used page's window again and gives focus back to the person's app. */
    putBack(conversationId: string): Promise<void>;
    /**
     * A JPEG of the conversation's last-used page, taken while its window stays minimized; `null` when the
     * conversation has no page or the browser is not running.
     */
    thumbnail(conversationId: string): Promise<Uint8Array | null>;
    /** Creates the Downloads folder in the data root when it is missing; rejects when it is not a real folder (a link). */
    ensureDownloadsFolder(): Promise<void>;
}

/** How the browser is launched; tests replace it to run headless against their own proxy. */
export interface BrowserLaunchOptions {
    /** The port of `BrowserNetworkGuard`. */
    proxyPort: number;
    /** Appended to the command line. */
    extraArgs: string[];
}

/** The launch options: the daemon's proxy port and nothing extra. */
export const BrowserLaunch = defineInterface<BrowserLaunchOptions>({
    name: 'BrowserLaunch',
    default: () => ({ proxyPort: BROWSER_PROXY_PORT, extraArgs: [] }),
});

/** How long a stale browser gets to exit after each signal. */
const STALE_EXIT_TIMEOUT_MS = 5000;
/** JPEG quality of a thumbnail: small enough to ship often, sharp enough to recognise the page. */
const THUMBNAIL_QUALITY = 60;
/** How long a thumbnail may take before the handoff goes without one. */
const THUMBNAIL_TIMEOUT_MS = 10_000;
/** A download guid as the browser makes it; anything else never becomes part of a path. */
const DOWNLOAD_GUID = /^[\w-]+$/;

export const BrowserService = defineService({
    name: 'BrowserService',
    deps: {
        logger: Logger,
        install: ChromiumInstall,
        focusKeeper: FocusKeeper,
        pace: BrowserPace,
        launchOptions: BrowserLaunch,
        limaHome: PIKO_LIMA_HOME,
        dataRoot: PIKO_DATA_ROOT,
    },
    setup({ logger, install, focusKeeper, pace, launchOptions, limaHome, dataRoot }): BrowserServiceShape {
        const stateFolder = path.dirname(limaHome);
        const profileFolder = path.join(stateFolder, 'browser-profile');
        const browserDownloadsFolder = path.join(stateFolder, 'browser-downloads');
        const pidFile = path.join(stateFolder, 'browser.pid');
        const downloadsFolder = path.join(dataRoot, DOWNLOADS_FOLDER);

        const exitedEmitter = createEventEmitter();
        const launchRunner = createSingleRunner({ handler: launch });
        /** Suggested file names of downloads in progress, by guid. */
        const downloads = new Map<string, string>();
        let run: AgentBrowser | null = null;

        return {
            start: () => launchRunner.execute(),
            isRunning: () => run != null,
            send,
            exited: exitedEmitter.event,
            bringToFront,
            putBack,
            thumbnail,
            ensureDownloadsFolder,
        };

        async function bringToFront(conversationId: string) {
            const current = run;
            const targetId = current?.groups.lastUsed(conversationId);
            if (current == null || targetId == null) {
                return false;
            }
            await setWindowState(current, targetId, 'normal');
            await withOwnSession(current, targetId, sessionId => current.send('Page.bringToFront', {}, sessionId));
            return true;
        }

        async function putBack(conversationId: string) {
            const current = run;
            const targetId = current?.groups.lastUsed(conversationId);
            if (current != null && targetId != null) {
                await setWindowState(current, targetId, 'minimized');
            }
            focusKeeper.restore();
        }

        async function thumbnail(conversationId: string) {
            const current = run;
            const targetId = current?.groups.lastUsed(conversationId);
            if (current == null || targetId == null) {
                return null;
            }
            // A page that renders no frame (the browser has nothing to paint it with) would leave the call waiting for
            // good; the handoff UI shows no thumbnail instead.
            const reply = await withTimeout({
                operation: withOwnSession(current, targetId, sessionId =>
                    current.send('Page.captureScreenshot', { format: 'jpeg', quality: THUMBNAIL_QUALITY }, sessionId),
                ),
                timeoutMs: THUMBNAIL_TIMEOUT_MS,
                onTimeout: () => {
                    logger.warn('A thumbnail timed out', { conversationId });
                    return null;
                },
            });
            if (reply === null) {
                return null;
            }
            const data = isPlainObject(reply) ? reply['data'] : undefined;
            if (typeof data !== 'string') {
                throw new TypeError('Page.captureScreenshot gave no image');
            }
            return Buffer.from(data, 'base64');
        }

        async function ensureDownloadsFolder() {
            await mkdir(downloadsFolder, { recursive: true });
            if (!(await isRealFolder(downloadsFolder))) {
                throw new Error('The Downloads folder is not a real folder');
            }
        }

        async function setWindowState(current: AgentBrowser, targetId: string, windowState: 'normal' | 'minimized') {
            const window = await current.send('Browser.getWindowForTarget', { targetId });
            const windowId = isPlainObject(window) ? window['windowId'] : undefined;
            if (typeof windowId !== 'number') {
                throw new TypeError('Browser.getWindowForTarget gave no window id');
            }
            await current.send('Browser.setWindowBounds', { windowId, bounds: { windowState } });
        }

        /** Runs `action` on a session of the daemon's own, so its events never reach a client; detaches afterwards. */
        async function withOwnSession<T>(
            current: AgentBrowser,
            targetId: string,
            action: (sessionId: string) => Promise<T>,
        ) {
            const sessionId = await current.attach(targetId);
            try {
                return await action(sessionId);
            } finally {
                await current
                    .send('Target.detachFromTarget', { sessionId })
                    .catch((error: unknown) => logger.debug('A daemon session could not be detached', { error }));
            }
        }

        function send(method: string, params?: object, sessionId?: string) {
            if (run == null) {
                return Promise.reject(new Error('The browser is not running'));
            }
            return run.send(method, params, sessionId);
        }

        async function launch() {
            if (run) {
                return run;
            }
            const executablePath = install.getExecutable();
            if (!executablePath) {
                throw new Error('The browser is not installed yet');
            }

            // Before the browser can show a window: only an app seen before it can get focus back.
            focusKeeper.start();
            await stopStaleBrowser();
            await mkdir(profileFolder, { recursive: true });
            await mkdir(browserDownloadsFolder, { recursive: true });

            const current = await launchStealthBrowser<ProductClientData>({
                executablePath,
                userDataDir: profileFolder,
                args: buildChromiumArgs({ proxyPort: launchOptions.proxyPort, extraArgs: launchOptions.extraArgs }),
                policy: checkProductRequest,
                pace,
                logger,
            });
            current.onEvent(event => onEvent(current, event));
            void current.exited.then(() => onExit(current));
            await writeFile(pidFile, String(current.pid));

            try {
                await current.send('Browser.setDownloadBehavior', {
                    behavior: 'allowAndName',
                    downloadPath: browserDownloadsFolder,
                    eventsEnabled: true,
                });
            } catch (error) {
                logger.error('The browser could not be configured', { error });
                await current.close();
                throw error;
            }
            run = current;
            return current;
        }

        function onEvent(current: AgentBrowser, event: CdpEvent) {
            switch (event.method) {
                case 'Target.targetCreated': {
                    const targetInfo = isPlainObject(event.params) ? event.params['targetInfo'] : undefined;
                    if (
                        isPlainObject(targetInfo) &&
                        targetInfo['type'] === 'page' &&
                        typeof targetInfo['openerId'] === 'string' &&
                        typeof targetInfo['targetId'] === 'string'
                    ) {
                        void minimizePopup(current, targetInfo['targetId']);
                    }
                    break;
                }
                case 'Browser.downloadWillBegin':
                    onDownloadBegin(event.params);
                    break;
                case 'Browser.downloadProgress':
                    onDownloadProgress(event.params);
                    break;
            }
        }

        /** A popup opens a normal window and activates the browser: minimize it and give focus back at once. */
        async function minimizePopup(current: AgentBrowser, targetId: string) {
            try {
                await setWindowState(current, targetId, 'minimized');
            } catch (error) {
                logger.warn('A popup could not be minimized', { error });
            }
            focusKeeper.restore();
        }

        function onDownloadBegin(params: unknown) {
            if (!isPlainObject(params)) {
                return;
            }
            const { guid, suggestedFilename } = params;
            if (typeof guid === 'string' && DOWNLOAD_GUID.test(guid)) {
                downloads.set(guid, typeof suggestedFilename === 'string' ? suggestedFilename : '');
            }
        }

        function onDownloadProgress(params: unknown) {
            if (!isPlainObject(params)) {
                return;
            }
            const { guid, state } = params;
            if (
                typeof guid !== 'string' ||
                !DOWNLOAD_GUID.test(guid) ||
                (state !== 'completed' && state !== 'canceled')
            ) {
                return;
            }
            const suggestedName = downloads.get(guid) ?? '';
            downloads.delete(guid);
            const source = path.join(browserDownloadsFolder, guid);
            if (state === 'completed') {
                void saveDownload(source, suggestedName);
            } else {
                void rm(source, { force: true }).catch((error: unknown) =>
                    logger.warn('A canceled download could not be removed', { error }),
                );
            }
        }

        async function saveDownload(source: string, suggestedName: string) {
            try {
                const destination = await moveDownload({ source, folder: downloadsFolder, suggestedName });
                if (destination == null) {
                    logger.warn('The Downloads folder is not a real folder, a download was kept back');
                    return;
                }
                logger.info('A download was saved');
            } catch (error) {
                logger.error('A download could not be saved', { error });
            }
        }

        function onExit(current: AgentBrowser) {
            if (run !== current) {
                return;
            }
            run = null;
            downloads.clear();
            exitedEmitter.emit();
        }

        /**
         * A browser from an earlier daemon run can still hold the profile (a pipe browser outlives a daemon that was
         * killed hard only briefly, but long enough to block the next launch). Stops the one `browser.pid` names, only if
         * it is still a browser on this profile: a recycled pid is someone else's process.
         */
        async function stopStaleBrowser() {
            let pid: number;
            try {
                pid = Number((await readFile(pidFile, 'utf8')).trim());
            } catch (error) {
                if (isErrorCode(error, 'ENOENT')) {
                    return;
                }
                throw error;
            }
            if (!Number.isInteger(pid) || pid <= 0 || !(await isBrowserOnProfile(pid))) {
                return;
            }

            logger.warn('A browser from an earlier run holds the profile, stopping it', { pid });
            for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
                signalProcess(pid, signal);
                await waitUntil(() => !isAlive(pid), {
                    intervalMs: 50,
                    timeoutMs: STALE_EXIT_TIMEOUT_MS,
                    onTimeout: () => {},
                });
                if (!isAlive(pid)) {
                    return;
                }
            }
            throw new Error('A browser from an earlier run did not exit');
        }

        /** Whether `pid` runs a pipe-driven browser on this profile, by its command line. */
        async function isBrowserOnProfile(pid: number) {
            const ps = Bun.spawn(['ps', '-ww', '-p', String(pid), '-o', 'command='], {
                stdout: 'pipe',
                stderr: 'ignore',
            });
            const [output, exitCode] = await Promise.all([new Response(ps.stdout).text(), ps.exited]);
            if (exitCode !== 0) {
                return false;
            }
            // Padded, so an argument matches whole even when the path holds spaces.
            const command = ` ${output.trim()} `;
            return (
                command.includes(` --user-data-dir=${profileFolder} `) && command.includes(' --remote-debugging-pipe ')
            );
        }
    },
});

function isAlive(pid: number) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // EPERM: it exists but is not ours.
        return isErrorCode(error, 'EPERM');
    }
}

function signalProcess(pid: number, signal: NodeJS.Signals) {
    try {
        process.kill(pid, signal);
    } catch (error) {
        if (!isErrorCode(error, 'ESRCH')) {
            throw error;
        }
    }
}
