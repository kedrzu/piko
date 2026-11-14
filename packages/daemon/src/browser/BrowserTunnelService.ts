import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';

import { BROWSER_TUNNEL_PORT, POWERAGENTS_DATA_ROOT, POWERAGENTS_LIMA_HOME } from '../env.js';
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
/** What `readOrCreatePassword` writes; any other content of the token file is refused. */
const TOKEN_PATTERN = /^[\w-]{32}$/;
const BEARER_PREFIX = 'Bearer ';

export const BrowserTunnelService = defineService({
    name: 'BrowserTunnelService',
    deps: {
        logger: Logger,
        browser: BrowserService,
        install: ChromiumInstall,
        limaHome: POWERAGENTS_LIMA_HOME,
        dataRoot: POWERAGENTS_DATA_ROOT,
    },
    setup({ logger, browser, install, limaHome, dataRoot }): BrowserTunnelServiceShape {
        const stateFolder = path.dirname(limaHome);
        // Created by the sandbox, which hands the same token to the agent; the tunnel only reads it.
        const tokenFile = path.join(stateFolder, 'browser-token');
        const uploadsFolder = path.join(stateFolder, 'browser-uploads');

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
            if (!(await isAuthorized(request.headers.get('authorization')))) {
                return new Response('Unauthorized', { status: 401 });
            }
            const conversationId = SESSION_PATH.exec(new URL(request.url).pathname)?.[1];
            if (conversationId == null) {
                return new Response('Forbidden', { status: 403 });
            }
            if (install.getExecutable() == null) {
                return new Response('The browser is still being prepared, try again in a few minutes', {
                    status: 503,
                });
            }
            return conversationId;
        }

        async function isAuthorized(header: string | null) {
            if (header?.startsWith(BEARER_PREFIX) !== true) {
                return false;
            }
            const token = await readToken();
            if (token == null) {
                return false;
            }
            const given = Buffer.from(header.slice(BEARER_PREFIX.length));
            const expected = Buffer.from(token);
            return given.length === expected.length && timingSafeEqual(given, expected);
        }

        /** Read on every upgrade, so a token the sandbox rotates applies at once; `null` while none is usable. */
        async function readToken() {
            try {
                const token = await readFile(tokenFile, 'utf8');
                if (TOKEN_PATTERN.test(token)) {
                    return token;
                }
                logger.warn('The browser token file holds no valid token');
            } catch (error) {
                logger.warn('The browser token could not be read', { error });
            }
            return null;
        }
    },
});
