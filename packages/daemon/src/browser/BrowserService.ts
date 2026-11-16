import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';

import { defineInterface } from '@nzyme/ioc/Interface.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';
import type { EventEmitter } from '@nzyme/utils/createEventEmitter.js';
import { createSingleRunner } from '@nzyme/utils/createSingleRunner.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';
import { waitUntil } from '@nzyme/utils/waitUntil.js';
import { withTimeout } from '@nzyme/utils/withTimeout.js';

import { BROWSER_PROXY_PORT, DOWNLOADS_FOLDER, POWERAGENTS_DATA_ROOT, POWERAGENTS_LIMA_HOME } from '../env.js';
import { isErrorCode } from '../utils/isErrorCode.js';
import { isRealFolder } from '../utils/isRealFolder.js';
import { attachTargetSession } from './attachTargetSession.js';
import { buildChromiumArgs } from './buildChromiumArgs.js';
import { CdpError } from './CdpTypes.js';
import type { CdpErrorReply, CdpEvent } from './CdpTypes.js';
import { ChromiumInstall } from './ChromiumInstall.js';
import { createBrandOverride } from './createBrandOverride.js';
import type { BrandOverride } from './createBrandOverride.js';
import { createTargetOwnership } from './createTargetOwnership.js';
import type { TargetOwnership } from './createTargetOwnership.js';
import { FocusKeeper } from './FocusKeeper.js';
import { moveDownload } from './moveDownload.js';
import { readTargetInfo } from './readTargetInfo.js';
import { splitPipeFrames } from './splitPipeFrames.js';

/**
 * The agent's one browser (ADR `docs/decisions/agent-browser-over-one-pipe.md`): a Chrome for Testing the daemon
 * launches with no window and drives over `--remote-debugging-pipe`, so no other local process can reach it. Every
 * client of the tunnel and the daemon itself share this one connection; `ownership` says which pages and sessions are
 * whose. Popups are minimized at once, downloads land in the data root's Downloads folder, and every page and worker
 * names itself Google Chrome (`createBrandOverride`).
 */
export interface BrowserServiceShape {
    /**
     * Launches the browser unless it runs, and resolves once downloads are pinned and targets are discovered, so nothing
     * reaches the browser before it is configured. Calls made meanwhile join the launch. Rejects while the browser is
     * not installed, or when the launch fails; the next call tries again.
     */
    start(): Promise<void>;
    /** Whether a started browser is up; `false` again once it exits. */
    isRunning(): boolean;
    /**
     * Sends a CDP command, to a session when `sessionId` is given, and resolves with its unchecked `result`. Rejects
     * with `CdpError` when the browser answers with an error, and with a plain `Error` while the browser is not running
     * or when it exits before answering.
     */
    send(method: string, params?: object, sessionId?: string): Promise<unknown>;
    /** Every CDP event, after `ownership` has seen it. */
    event: EventEmitter<[event: CdpEvent]>;
    /** The browser exited: pending calls were rejected and ownership cleared. */
    exited: EventEmitter<[]>;
    /** Which conversation owns each page and which originator each session; reset when the browser exits. */
    ownership: TargetOwnership;
    /**
     * Brings the conversation's last-used page (its most recently created one when nothing was used yet) to the front:
     * its window is restored from minimized and the browser activated, for when the person must step in. Never touches
     * another conversation's window. Resolves `false`, doing nothing, when the conversation has no page.
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

/** One launched browser and what belongs to it alone. */
interface BrowserRun {
    child: ChildProcess;
    pipe: Writable;
    pending: Map<number, PendingCall>;
    /** Suggested file names of downloads in progress, by guid. */
    downloads: Map<string, string>;
    brand: BrandOverride;
    ready: boolean;
    /** The end of the browser's stderr, logged when it exits. */
    stderrTail: string;
}

/** A call waiting for its reply. */
interface PendingCall {
    resolve(result: unknown): void;
    reject(error: Error): void;
}

/** How long a stale browser gets to exit after each signal. */
const STALE_EXIT_TIMEOUT_MS = 5000;
/** How much of the browser's stderr is kept for the exit log. */
const STDERR_TAIL_LENGTH = 2000;
/** JPEG quality of a thumbnail: small enough to ship often, sharp enough to recognise the page. */
const THUMBNAIL_QUALITY = 60;
/** How long a thumbnail may take before the handoff goes without one. */
const THUMBNAIL_TIMEOUT_MS = 10_000;
/** How long reading the browser's own identity at launch may take before the launch fails and is retried. */
const BRAND_START_TIMEOUT_MS = 15_000;
/** A download guid as the browser makes it; anything else never becomes part of a path. */
const DOWNLOAD_GUID = /^[\w-]+$/;

export const BrowserService = defineService({
    name: 'BrowserService',
    deps: {
        logger: Logger,
        install: ChromiumInstall,
        focusKeeper: FocusKeeper,
        launchOptions: BrowserLaunch,
        limaHome: POWERAGENTS_LIMA_HOME,
        dataRoot: POWERAGENTS_DATA_ROOT,
    },
    setup({ logger, install, focusKeeper, launchOptions, limaHome, dataRoot }): BrowserServiceShape {
        const stateFolder = path.dirname(limaHome);
        const profileFolder = path.join(stateFolder, 'browser-profile');
        const browserDownloadsFolder = path.join(stateFolder, 'browser-downloads');
        const pidFile = path.join(stateFolder, 'browser.pid');
        const downloadsFolder = path.join(dataRoot, DOWNLOADS_FOLDER);

        const ownership = createTargetOwnership();
        const eventEmitter = createEventEmitter<[event: CdpEvent]>();
        const exitedEmitter = createEventEmitter();
        const launchRunner = createSingleRunner({ handler: launch });
        let run: BrowserRun | null = null;
        let lastId = 0;

        return {
            start: () => launchRunner.execute(),
            isRunning: () => run?.ready === true,
            send,
            event: eventEmitter.event,
            exited: exitedEmitter.event,
            ownership,
            bringToFront,
            putBack,
            thumbnail,
            ensureDownloadsFolder,
        };

        async function bringToFront(conversationId: string) {
            const targetId = ownership.lastUsed(conversationId);
            if (targetId == null) {
                return false;
            }
            await setWindowState(targetId, 'normal');
            await withDaemonSession(targetId, sessionId => send('Page.bringToFront', {}, sessionId));
            return true;
        }

        async function putBack(conversationId: string) {
            const targetId = ownership.lastUsed(conversationId);
            if (targetId != null) {
                await setWindowState(targetId, 'minimized');
            }
            focusKeeper.restore();
        }

        async function thumbnail(conversationId: string) {
            const targetId = ownership.lastUsed(conversationId);
            if (targetId == null || !run?.ready) {
                return null;
            }
            // A page that renders no frame (the browser has nothing to paint it with) would leave the call waiting for
            // good; the handoff UI shows no thumbnail instead.
            const reply = await withTimeout({
                operation: withDaemonSession(targetId, sessionId =>
                    send('Page.captureScreenshot', { format: 'jpeg', quality: THUMBNAIL_QUALITY }, sessionId),
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

        async function setWindowState(targetId: string, windowState: 'normal' | 'minimized') {
            const window = await send('Browser.getWindowForTarget', { targetId });
            const windowId = isPlainObject(window) ? window['windowId'] : undefined;
            if (typeof windowId !== 'number') {
                throw new TypeError('Browser.getWindowForTarget gave no window id');
            }
            await send('Browser.setWindowBounds', { windowId, bounds: { windowState } });
        }

        /** Runs `action` on a session of the daemon's own, so its events never reach a client; detaches afterwards. */
        async function withDaemonSession<T>(targetId: string, action: (sessionId: string) => Promise<T>) {
            const sessionId = await attachTargetSession({ send, ownership, originator: { type: 'daemon' }, targetId });
            ownership.claimSession({ type: 'daemon' }, sessionId, targetId);
            try {
                return await action(sessionId);
            } finally {
                await send('Target.detachFromTarget', { sessionId }).catch((error: unknown) =>
                    logger.debug('A daemon session could not be detached', { error }),
                );
            }
        }

        function send(method: string, params?: object, sessionId?: string) {
            if (!run?.ready) {
                return Promise.reject(new Error('The browser is not running'));
            }
            return call(run, method, params, sessionId);
        }

        async function launch() {
            if (run) {
                return;
            }
            const executable = install.getExecutable();
            if (!executable) {
                throw new Error('The browser is not installed yet');
            }

            // Before the browser can show a window: only an app seen before it can get focus back.
            focusKeeper.start();
            await stopStaleBrowser();
            await mkdir(profileFolder, { recursive: true });
            await mkdir(browserDownloadsFolder, { recursive: true });

            const current = await spawnBrowser(executable);
            run = current;
            if (current.child.pid != null) {
                await writeFile(pidFile, String(current.child.pid));
            }

            try {
                await call(current, 'Browser.setDownloadBehavior', {
                    behavior: 'allowAndName',
                    downloadPath: browserDownloadsFolder,
                    eventsEnabled: true,
                });
                await call(current, 'Target.setDiscoverTargets', { discover: true });
                // A page that never answers would leave every later start waiting on this launch; failing kills the
                // browser, and the next start launches a new one.
                await withTimeout({
                    operation: current.brand.start(),
                    timeoutMs: BRAND_START_TIMEOUT_MS,
                    onTimeout: () => {
                        throw new Error("The browser's identity could not be read in time");
                    },
                });
            } catch (error) {
                logger.error('The browser could not be configured', { error });
                current.child.kill('SIGKILL');
                throw error;
            }
            current.ready = true;
            logger.info('The browser started', { pid: current.child.pid });
        }

        async function spawnBrowser(executable: string): Promise<BrowserRun> {
            const args = buildChromiumArgs({
                userDataDir: profileFolder,
                proxyPort: launchOptions.proxyPort,
                extraArgs: launchOptions.extraArgs,
            });
            // fd 3 is what the browser reads commands from, fd 4 where it writes replies and events.
            const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
            await new Promise<void>((resolve, reject) => {
                child.once('spawn', resolve);
                child.once('error', reject);
            });
            child.on('error', error => logger.error('The browser process failed', { error }));

            const [, , stderr, pipe, input] = child.stdio;
            if (!(pipe instanceof Writable) || !(input instanceof Readable) || !(stderr instanceof Readable)) {
                child.kill('SIGKILL');
                throw new Error('The browser was spawned without its pipes');
            }

            const current: BrowserRun = {
                child,
                pipe,
                pending: new Map(),
                downloads: new Map(),
                brand: createBrandOverride({
                    send: (method, params, sessionId) => call(current, method, params, sessionId),
                    ownership,
                    logger,
                }),
                ready: false,
                stderrTail: '',
            };
            pipe.on('error', error => logger.debug('The pipe to the browser failed', { error }));
            stderr.on('data', (chunk: Buffer) => {
                current.stderrTail = (current.stderrTail + chunk.toString()).slice(-STDERR_TAIL_LENGTH);
            });
            let rest = Buffer.alloc(0);
            input.on('data', (chunk: Buffer) => {
                const split = splitPipeFrames(rest.length > 0 ? Buffer.concat([rest, chunk]) : chunk);
                rest = Buffer.from(split.rest);
                for (const frame of split.frames) {
                    handleFrame(current, frame);
                }
            });
            child.once('exit', (code, signal) => onExit(current, code, signal));
            return current;
        }

        function call(current: BrowserRun, method: string, params?: object, sessionId?: string) {
            const id = ++lastId;
            return new Promise<unknown>((resolve, reject) => {
                current.pending.set(id, { resolve, reject });
                current.pipe.write(`${JSON.stringify({ id, method, params: params ?? {}, sessionId })}\0`);
            });
        }

        function handleFrame(current: BrowserRun, frame: string) {
            let message: unknown;
            try {
                message = JSON.parse(frame);
            } catch (error) {
                logger.warn('The browser sent a malformed message', { error });
                return;
            }
            if (!isPlainObject(message)) {
                return;
            }

            const { id, method, sessionId } = message;
            if (typeof id === 'number') {
                const pending = current.pending.get(id);
                current.pending.delete(id);
                const error = readErrorReply(message['error']);
                if (error) {
                    pending?.reject(new CdpError(error));
                } else {
                    pending?.resolve(message['result']);
                }
                return;
            }
            if (typeof method === 'string') {
                dispatchEvent(current, {
                    method,
                    params: message['params'],
                    sessionId: typeof sessionId === 'string' ? sessionId : undefined,
                });
            }
        }

        function dispatchEvent(current: BrowserRun, event: CdpEvent) {
            ownership.observe(event);
            current.brand.observe(event);
            switch (event.method) {
                case 'Target.targetCreated': {
                    const info = readTargetInfo(event.params);
                    if (info?.type === 'page' && info.openerId != null) {
                        void minimizePopup(current, info.targetId);
                    }
                    break;
                }
                case 'Browser.downloadWillBegin':
                    onDownloadBegin(current, event.params);
                    break;
                case 'Browser.downloadProgress':
                    onDownloadProgress(current, event.params);
                    break;
            }
            try {
                eventEmitter.emit(event);
            } catch (error) {
                logger.error('A browser event listener failed', { error, method: event.method });
            }
        }

        /** A popup opens a normal window and activates the browser: minimize it and give focus back at once. */
        async function minimizePopup(current: BrowserRun, targetId: string) {
            try {
                const window = await call(current, 'Browser.getWindowForTarget', { targetId });
                const windowId = isPlainObject(window) ? window['windowId'] : undefined;
                if (typeof windowId !== 'number') {
                    throw new TypeError('Browser.getWindowForTarget gave no window id');
                }
                await call(current, 'Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
            } catch (error) {
                logger.warn('A popup could not be minimized', { error });
            }
            focusKeeper.restore();
        }

        function onDownloadBegin(current: BrowserRun, params: unknown) {
            if (!isPlainObject(params)) {
                return;
            }
            const { guid, suggestedFilename } = params;
            if (typeof guid === 'string' && DOWNLOAD_GUID.test(guid)) {
                current.downloads.set(guid, typeof suggestedFilename === 'string' ? suggestedFilename : '');
            }
        }

        function onDownloadProgress(current: BrowserRun, params: unknown) {
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
            const suggestedName = current.downloads.get(guid) ?? '';
            current.downloads.delete(guid);
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

        function onExit(current: BrowserRun, code: number | null, signal: NodeJS.Signals | null) {
            if (run !== current) {
                return;
            }
            run = null;
            for (const pending of current.pending.values()) {
                pending.reject(new Error('The browser exited'));
            }
            current.pending.clear();
            ownership.clear();
            logger.warn('The browser exited', { code, signal, stderr: current.stderrTail.trim() });
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

function readErrorReply(error: unknown): CdpErrorReply | null {
    if (!isPlainObject(error)) {
        return null;
    }
    const { code, message, data } = error;
    return {
        code: typeof code === 'number' ? code : 0,
        message: typeof message === 'string' ? message : 'The browser answered with an error',
        data: typeof data === 'string' ? data : undefined,
    };
}

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
