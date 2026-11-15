import { createContainer } from '@nzyme/ioc/Container.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { DAEMON_EVENTS_PATH } from '@poweragents/common/api/DaemonEventTypes.js';
import { DAEMON_API_PATH, DAEMON_PORT } from '@poweragents/common/daemonAddress.js';

import { ApiService } from './api/ApiService.js';
import { ConversationEventService } from './conversations/ConversationEventService.js';
import { BrowserNetworkGuard } from './browser/BrowserNetworkGuard.js';
import { BrowserService } from './browser/BrowserService.js';
import { BrowserTunnelService } from './browser/BrowserTunnelService.js';
import { ChromiumInstall } from './browser/ChromiumInstall.js';
import { POWERAGENTS_VERSION } from './env.js';
import { DaemonLoggerTransport } from './logging/DaemonLoggerTransport.js';
import { MemoryService } from './memory/MemoryService.js';
import { LimaSandbox } from './sandbox/LimaSandbox.js';
import { Sandbox } from './sandbox/Sandbox.js';
import { SandboxOpencodeConnection } from './sandbox/SandboxOpencodeConnection.js';
import { ScheduleRunnerService } from './schedules/ScheduleRunnerService.js';
import { shutdown } from './shutdown.js';
import { createStatusResponse } from './statusResponse.js';

// The daemon's entry point: one container for the whole process.
const container = createContainer();
container.register(DaemonLoggerTransport);
container.register(LimaSandbox);
container.register(SandboxOpencodeConnection);
const logger = container.resolve(Logger);

// Bun prints these to stderr, which the packaged app discards: the log is the only record. They are registered before
// anything else starts, so a failure while the daemon starts is recorded too. The transport writes
// synchronously, so the entry is on disk before an uncaught exception ends the process. A rejection nobody handled
// is logged and the daemon keeps serving, like a failed sandbox start.
process.on('uncaughtException', error => {
    logger.error('Uncaught exception', { error });
    process.exit(1);
});
process.on('unhandledRejection', error => {
    logger.error('Unhandled rejection', { error });
});

const api = container.resolve(ApiService);

// The Memory folder exists before the agent starts, so the agent finds it where its instructions say (design D9). A
// failure is logged and the daemon keeps serving: the agent can still create the folder itself.
await container
    .resolve(MemoryService)
    .ensureFolder()
    .catch((error: unknown) => logger.error('Memory folder could not be created', { error }));

// The agent's browser (design D27). Downloads land in the data root's Downloads folder, which exists before the agent
// looks for it. Every browser request goes through the network guard, so it listens before the browser can launch; the
// tunnel answers the sandbox at once and refuses it until the browser, downloaded in the background on first start, is
// installed. Chrome itself starts on the first tunnel connection. A failure here is logged and the daemon keeps serving.
const browser = container.resolve(BrowserService);
await browser
    .ensureDownloadsFolder()
    .catch((error: unknown) => logger.error('Downloads folder could not be created', { error }));
await container
    .resolve(BrowserNetworkGuard)
    .listen()
    .catch((error: unknown) => logger.error('The browser network guard could not start', { error }));
try {
    container.resolve(BrowserTunnelService).listen();
} catch (error) {
    logger.error('The browser tunnel could not start', { error });
}
container
    .resolve(ChromiumInstall)
    .ensure()
    .catch(() => undefined);

// The sandbox comes up in the background while the daemon already answers. A failure is logged by the sandbox and
// leaves it `failed`; the daemon keeps serving. The VM is deliberately not stopped on exit: the daemon is long-lived,
// and `bun --watch` restarts it on every edit, where a VM stop and start would cost ~14 s each time.
container
    .resolve(Sandbox)
    .start()
    .catch(() => undefined);

// The agent's event feed starts with the daemon, not with the app: the agent asks before every file edit and the
// daemon answers (`FileHoldService`), so with the app closed the agent would stall otherwise. It waits for the sandbox.
container.resolve(ConversationEventService).start();
// Schedules run from the start: the runner keeps their state files current at once, and a term waits for the sandbox
// rather than failing while it comes up.
container.resolve(ScheduleRunnerService).start();

// It listens on loopback only: the desktop app reaches it on this machine, and remote clients (the phone) will come
// through the relay, never through an open port. `/status` stays open to any caller: it reveals only that the daemon
// runs and its version. The API admits only the app (`ApiService`).
const version = container.resolve(POWERAGENTS_VERSION);
const server = Bun.serve({
    hostname: '127.0.0.1',
    port: Number(process.env.POWERAGENTS_DAEMON_PORT ?? DAEMON_PORT),
    routes: {
        '/status': () => createStatusResponse(version),
        // An event stream stays open for as long as the app does: Bun's idle timeout (10 s) must not close it.
        [DAEMON_EVENTS_PATH]: (request, self) => {
            self.timeout(request, 0);
            return api.handle(request);
        },
        [`${DAEMON_API_PATH}*`]: request => api.handle(request),
    },
    fetch: () => new Response('Not found', { status: 404 }),
});

logger.info('Daemon listening', { url: server.url.href });

// The desktop app replaces an old daemon after an update by sending SIGTERM. The sandbox is left running (see above).
for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => void shutdown({ server, logger, signal, exit: code => process.exit(code) }));
}
