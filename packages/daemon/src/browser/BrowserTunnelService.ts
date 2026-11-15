import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';

import { BROWSER_TUNNEL_PORT, POWERAGENTS_DATA_ROOT, POWERAGENTS_LIMA_HOME } from '../env.js';
import { SandboxTokenCheckCommand } from '../sandbox/SandboxTokenCheckCommand.js';
import { BrowserService } from './BrowserService.js';
import { ChromiumInstall } from './ChromiumInstall.js';
import { connectTunnelClient } from './connectTunnelClient.js';
import type { TunnelClient } from './connectTunnelClient.js';

/**
 * The WebSocket endpoint the agent's CLI inside the sandbox drives the browser through (ADR
 * `docs/decisions/agent-browser-over-one-pipe.md`): `ws://<gateway>/session/<conversation id>` with the sandbox's
 * bearer token. Every socket is multiplexed over the browser's one pipe and sees only its conversation's pages and the
 * sessions it opened itself.
 */
export interface BrowserTunnelServiceShape {
    /** Starts the tunnel on loopback; `port` defaults to `BROWSER_TUNNEL_PORT` (tests pass `0` for a free one). */
    listen(port?: number): BrowserTunnelServer;
}

/** A running tunnel. */
export interface BrowserTunnelServer {
    /** The loopback port it accepts connections on. */
    port: number;
    /** Stops accepting and closes every socket. */
    close(): Promise<void>;
}

/** What an accepted socket carries from its upgrade. */
interface TunnelSocketData {
    clientId: string;
    conversationId: string;
    client?: TunnelClient;
}

/** The only path a socket may open: an OpenCode session id (`ses_…`) names the conversation. */
const SESSION_PATH = /^\/session\/([\w-]{1,128})$/;

export const BrowserTunnelService = defineService({
    name: 'BrowserTunnelService',
    deps: {
        logger: Logger,
        browser: BrowserService,
        install: ChromiumInstall,
        limaHome: POWERAGENTS_LIMA_HOME,
        dataRoot: POWERAGENTS_DATA_ROOT,
        checkToken: SandboxTokenCheckCommand,
    },
    setup({ logger, browser, install, limaHome, dataRoot, checkToken }): BrowserTunnelServiceShape {
        const uploadsFolder = path.join(path.dirname(limaHome), 'browser-uploads');

        return { listen };

        function listen(port = BROWSER_TUNNEL_PORT) {
            const server = Bun.serve<TunnelSocketData>({
                hostname: '127.0.0.1',
                port,
                fetch: async (request, self) => {
                    const checked = await checkUpgrade(request);
                    if (checked instanceof Response) {
                        return checked;
                    }
                    const data: TunnelSocketData = { clientId: randomUUID(), conversationId: checked };
                    if (self.upgrade(request, { data })) {
                        return undefined;
                    }
                    return new Response('A WebSocket upgrade is expected', { status: 400 });
                },
                websocket: {
                    open(socket) {
                        socket.data.client = connectTunnelClient({
                            clientId: socket.data.clientId,
                            conversationId: socket.data.conversationId,
                            socket,
                            browser,
                            dataRoot,
                            uploadsFolder,
                            logger,
                        });
                    },
                    message(socket, message) {
                        if (typeof message === 'string') {
                            socket.data.client?.receive(message);
                        } else {
                            socket.close(1003, 'CDP messages are text');
                        }
                    },
                    close(socket) {
                        socket.data.client?.close();
                    },
                },
            });
            const boundPort = server.port;
            if (boundPort == null) {
                void server.stop(true);
                throw new Error('The browser tunnel listens on no port');
            }
            logger.info('The browser tunnel is listening', { port: boundPort });
            return { port: boundPort, close: () => server.stop(true) };
        }

        /** The conversation id of an upgrade that may go ahead, or the response refusing it. */
        async function checkUpgrade(request: Request): Promise<string | Response> {
            // A browser page sends Origin; the agent's CLI does not. A page must never reach the tunnel.
            if (request.headers.has('origin')) {
                return new Response('Forbidden', { status: 403 });
            }
            if (!(await checkToken(request.headers.get('authorization')))) {
                return new Response('Unauthorized', { status: 401 });
            }
            const conversationId = SESSION_PATH.exec(new URL(request.url).pathname)?.[1];
            if (conversationId == null) {
                return new Response('Forbidden', { status: 403 });
            }
            if (install.getExecutable() == null) {
                // Joins a download in progress, or starts it again after one that failed: the agent asking is the
                // retry, so a failed first download does not wait for the daemon's next start.
                install.ensure().catch(() => undefined);
                return new Response('The browser is still being prepared, try again in a few minutes', {
                    status: 503,
                });
            }
            return conversationId;
        }
    },
});
