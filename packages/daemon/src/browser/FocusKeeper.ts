import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';

/**
 * Gives focus back to the person's app after the agent's browser steals it (a page's popup activates Chrome). A small
 * macOS helper watches which app is frontmost; the daemon never activates anything but the last app that was not the
 * browser. Does nothing off macOS.
 */
export interface FocusKeeperShape {
    /**
     * Starts the helper if it is not running. The browser's launcher calls it before the browser can show a window,
     * because only an app seen activating before the browser can be restored.
     */
    start(): void;
    /** Activates the last app that was not the browser; does nothing while none is known. Starts the helper if needed. */
    restore(): void;
}

/** What the helper reports about the frontmost app. */
export interface ActivatedApp {
    pid: number;
    bundleId: string;
}

/** Bundle id of Chrome for Testing, the agent's browser. */
const BROWSER_BUNDLE_ID = 'com.google.chrome.for.testing';

/**
 * The helper: prints `ready <bundleId> <pid>` for the frontmost app at start and `activated <pid> <bundleId>` on every
 * app activation; `activate <pid>` on stdin brings that app forward. It exits when stdin closes, so it never outlives
 * the daemon.
 */
const HELPER_SCRIPT = String.raw`
ObjC.import('AppKit');
ObjC.import('Foundation');
ObjC.import('stdlib');
const ws = $.NSWorkspace.sharedWorkspace;
const out = $.NSFileHandle.fileHandleWithStandardOutput;
function emit(s) { out.writeData($(s + '\n').dataUsingEncoding($.NSUTF8StringEncoding)); }
ObjC.registerSubclass({
  name: 'PAObserver',
  methods: {
    'activated:': { types: ['void', ['id']], implementation: function (n) {
      const app = n.userInfo.objectForKey($.NSWorkspaceApplicationKey);
      emit('activated ' + app.processIdentifier + ' ' + ObjC.unwrap(app.bundleIdentifier));
    } },
    'stdin:': { types: ['void', ['id']], implementation: function (n) {
      const data = n.userInfo.objectForKey($.NSFileHandleNotificationDataItem);
      if (data.length == 0) { $.exit(0); }
      const line = ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding)).trim();
      const pid = parseInt(line.split(' ')[1]);
      const app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(pid);
      if (!app.isNil()) { app.activateWithOptions(0); }
      n.object.readInBackgroundAndNotify;
    } },
  },
});
const obs = $.PAObserver.alloc.init;
ws.notificationCenter.addObserverSelectorNameObject(obs, 'activated:', $.NSWorkspaceDidActivateApplicationNotification, $());
const stdin = $.NSFileHandle.fileHandleWithStandardInput;
$.NSNotificationCenter.defaultCenter.addObserverSelectorNameObject(obs, 'stdin:', $.NSFileHandleReadCompletionNotification, stdin);
stdin.readInBackgroundAndNotify;
emit('ready ' + ObjC.unwrap(ws.frontmostApplication.bundleIdentifier) + ' ' + ws.frontmostApplication.processIdentifier);
$.NSRunLoop.currentRunLoop.run;
`;

/**
 * Reads one helper output line: `activated <pid> <bundleId>` or `ready <bundleId> <pid>`. `null` for anything else,
 * including a malformed pid.
 */
export function parseHelperLine(line: string): ActivatedApp | null {
    const [kind, first, second] = line.trim().split(' ');
    if (kind === 'activated' && first && second) {
        return toActivatedApp(first, second);
    }
    if (kind === 'ready' && first && second) {
        return toActivatedApp(second, first);
    }
    return null;
}

/** The app to restore after `app` activated: `app` itself unless it is the browser, then the one kept so far. */
export function chooseRestorePid(current: number | null, app: ActivatedApp): number | null {
    return app.bundleId === BROWSER_BUNDLE_ID ? current : app.pid;
}

function toActivatedApp(pid: string, bundleId: string): ActivatedApp | null {
    const parsed = Number(pid);
    return Number.isInteger(parsed) && parsed > 0 ? { pid: parsed, bundleId } : null;
}

export const FocusKeeper = defineService({
    name: 'FocusKeeper',
    deps: { logger: Logger },
    setup({ logger }): FocusKeeperShape {
        let helper: Bun.Subprocess<'pipe', 'pipe', 'pipe'> | null = null;
        let restorePid: number | null = null;

        return { start, restore };

        function start() {
            if (process.platform !== 'darwin' || helper) {
                return;
            }
            try {
                const child = Bun.spawn(['osascript', '-l', 'JavaScript', '-e', HELPER_SCRIPT], {
                    stdin: 'pipe',
                    stdout: 'pipe',
                    stderr: 'pipe',
                });
                helper = child;
                void watch(child);
            } catch (error) {
                logger.error('The focus helper failed to start', { error });
            }
        }

        function restore() {
            start();
            if (!helper || restorePid == null) {
                return;
            }
            try {
                void helper.stdin.write(`activate ${restorePid}\n`);
                void helper.stdin.flush();
            } catch (error) {
                logger.warn('The focus helper did not take the restore request', { error });
            }
        }

        /** Follows the helper's output until it exits; the next `start()` then spawns a fresh one. */
        async function watch(child: Bun.Subprocess<'pipe', 'pipe', 'pipe'>) {
            try {
                const decoder = new TextDecoder();
                let pending = '';
                for await (const chunk of child.stdout) {
                    pending += decoder.decode(chunk, { stream: true });
                    const lines = pending.split('\n');
                    pending = lines.pop() ?? '';
                    for (const line of lines) {
                        handleLine(line);
                    }
                }
                const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
                logger.warn('The focus helper exited', { exitCode, stderr: stderr.trim() });
            } catch (error) {
                logger.error('The focus helper failed', { error });
            } finally {
                if (helper === child) {
                    helper = null;
                }
            }
        }

        function handleLine(line: string) {
            const app = parseHelperLine(line);
            if (app) {
                restorePid = chooseRestorePid(restorePid, app);
            }
        }
    },
});
