import path from 'node:path';

import type { ServerWebSocket } from 'bun';

import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import type { CdpClient } from '@nzyme/stealth-browser';

import { BROWSER_TUNNEL_PORT, POWERAGENTS_DATA_ROOT, POWERAGENTS_LIMA_HOME } from '../env.js';
import { SandboxTokenCheckCommand } from '../sandbox/SandboxTokenCheckCommand.js';
import { BrowserService } from './BrowserService.js';
import type { AgentBrowser } from './BrowserService.js';
import { ChromiumInstall } from './ChromiumInstall.js';

/**
 * The WebSocket endpoint the agent's CLI inside the sandbox drives the browser through (ADR
 * `docs/decisions/agent-browser-over-one-pipe.md`): `ws://<gateway>/session/<conversation id>` with the sandbox's
 * bearer token. Every socket is a client of the browser's run with its conversation as the group, so it sees only its
 * conversation's pages and the sessions it opened itself. The first socket starts the browser; what a socket sends
 * meanwhile waits for the start, and a socket whose browser fails to start or exits is closed with 1011.
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
    conversationId: string;
    /** Messages that came before the browser started, in order; handed to the client once it is connected. */
    buffered: string[];
    client?: CdpClient;
    closed: boolean;
}

/** WebSocket close code: the server met a condition it cannot go on from. */
const CLOSE_SERVER_ERROR = 1011;

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
                    const data: TunnelSocketData = { conversationId: checked, buffered: [], closed: false };
                    if (self.upgrade(request, { data })) {
                        return undefined;
                    }
                    return new Response('A WebSocket upgrade is expected', { status: 400 });
                },
                websocket: {
                    open(socket) {
                        void connectClient(socket);
                    },
                    message(socket, message) {
                        if (typeof message !== 'string') {
                            socket.close(1003, 'CDP messages are text');
                        } else if (socket.data.client) {
                            socket.data.client.receive(message);
                        } else {
                            socket.data.buffered.push(message);
                        }
                    },
                    close(socket) {
                        socket.data.closed = true;
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

        /** Starts the browser, then connects the socket to it and hands over what it sent meanwhile. */
        async function connectClient(socket: ServerWebSocket<TunnelSocketData>) {
            let run: AgentBrowser;
            try {
                run = await browser.start();
            } catch (error) {
                logger.warn('The browser could not start for a tunnel client', { error });
                socket.close(CLOSE_SERVER_ERROR, 'The browser could not start');
                return;
            }
            if (socket.data.closed) {
                return;
            }
            const client = run.connect(socket, {
                group: socket.data.conversationId,
                data: { dataRoot, uploadsFolder },
            });
            socket.data.client = client;
            for (const text of socket.data.buffered.splice(0)) {
                client.receive(text);
            }
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
