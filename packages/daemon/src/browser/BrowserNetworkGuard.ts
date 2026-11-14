import { lookup } from 'node:dns/promises';
import { createConnection, createServer, isIP } from 'node:net';
import type { Server, Socket } from 'node:net';

import { defineInterface } from '@nzyme/ioc/Interface.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';

import { BROWSER_PROXY_PORT } from '../env.js';
import { isPublicAddress } from './isPublicAddress.js';

/**
 * The proxy the agent's browser sends all its traffic through, so that it reaches only public addresses (D8; ADR
 * `docs/decisions/agent-browser-network-guard.md`). It checks every address a destination resolves to and connects to
 * the address it checked, so a name resolving, or re-resolving, to a private address never gets through.
 */
export interface BrowserNetworkGuardShape {
    /** Starts the proxy on loopback; `port` defaults to `BROWSER_PROXY_PORT` (tests pass `0` for a free one). */
    listen(port?: number): Promise<BrowserProxyServer>;
}

/** A running proxy. */
export interface BrowserProxyServer {
    /** The loopback port it accepts connections on. */
    port: number;
    close(): Promise<void>;
}

/** How the proxy finds a destination's addresses and judges them; tests replace it to reach a local server. */
export interface BrowserDestinationPolicy {
    /** Every address a host name resolves to. */
    resolve(host: string): Promise<string[]>;
    /** Whether the browser may connect to the address. */
    isAllowed(address: string): boolean;
}

/** The destination policy: the system resolver and public addresses only. */
export const BrowserDestinations = defineInterface<BrowserDestinationPolicy>({
    name: 'BrowserDestinations',
    default: () => ({ resolve: resolveAll, isAllowed: isPublicAddress }),
});

/** A request head larger than this is refused; browsers send a few kilobytes at most. */
const MAX_HEAD_BYTES = 16 * 1024;

const HEAD_END = Buffer.from('\r\n\r\n');

/** Request headers meant for the proxy, or replaced by `Connection: close`, never forwarded to the server. */
const DROPPED_HEADERS = new Set(['proxy-connection', 'proxy-authorization', 'connection', 'keep-alive']);

/** Where a request goes, and what to send there once connected. */
interface ProxyTarget {
    host: string;
    port: number;
    /** `null` for a tunnel (`CONNECT`): reply `200` and pass bytes through. */
    head: string | null;
}

export const BrowserNetworkGuard = defineService({
    name: 'BrowserNetworkGuard',
    deps: { logger: Logger, destinations: BrowserDestinations },
    setup({ logger, destinations }): BrowserNetworkGuardShape {
        return { listen };

        async function listen(port = BROWSER_PROXY_PORT) {
            const server = createServer(handleClient);
            await new Promise<void>((resolve, reject) => {
                server.once('error', reject);
                server.listen(port, '127.0.0.1', () => {
                    server.off('error', reject);
                    resolve();
                });
            });
            server.on('error', error => logger.error('The browser proxy failed', { error }));

            const address = server.address();
            const boundPort = address && typeof address === 'object' ? address.port : port;
            return { port: boundPort, close: () => closeServer(server) };
        }

        function handleClient(client: Socket) {
            let received = Buffer.alloc(0);
            client.on('error', () => client.destroy());
            client.on('data', onData);

            function onData(chunk: Buffer) {
                received = Buffer.concat([received, chunk]);
                const headEnd = received.indexOf(HEAD_END);
                if (headEnd < 0) {
                    if (received.length > MAX_HEAD_BYTES) {
                        refuse(client, 400);
                    }
                    return;
                }
                client.off('data', onData);
                client.pause();
                if (headEnd > MAX_HEAD_BYTES) {
                    refuse(client, 400);
                    return;
                }
                const head = received.subarray(0, headEnd).toString('latin1');
                const rest = received.subarray(headEnd + HEAD_END.length);
                void forward(client, head, rest);
            }
        }

        async function forward(client: Socket, head: string, rest: Buffer) {
            const target = parseRequestHead(head);
            if (!target) {
                refuse(client, 400);
                return;
            }

            let addresses: string[];
            try {
                addresses = isIP(target.host) ? [target.host] : await destinations.resolve(target.host);
            } catch (error) {
                logger.debug('The browser proxy could not resolve a host', { host: target.host, error });
                refuse(client, 502);
                return;
            }

            const address = addresses[0];
            if (address == null || !addresses.every(candidate => destinations.isAllowed(candidate))) {
                logger.debug('The browser proxy refused a destination', { host: target.host });
                refuse(client, 403);
                return;
            }

            if (client.destroyed) {
                return;
            }
            let connected = false;
            const upstream = createConnection({ host: address, port: target.port });
            upstream.on('error', () => {
                if (!connected) {
                    refuse(client, 502);
                }
                upstream.destroy();
            });
            upstream.once('connect', () => {
                connected = true;
                if (target.head == null) {
                    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                } else {
                    upstream.write(target.head);
                }
                if (rest.length > 0) {
                    upstream.write(rest);
                }
                client.pipe(upstream);
                upstream.pipe(client);
            });
            client.once('close', () => upstream.destroy());
            // Before the connection is up, the 502 refusal ends the client instead.
            upstream.once('close', () => {
                if (connected) {
                    client.destroy();
                }
            });
        }
    },
});

/**
 * Reads a proxy request head: `CONNECT host:port` for a tunnel, or an absolute-form `http://` request, rewritten to
 * origin form with `Connection: close` (one request per proxy connection). `null` for anything else.
 */
function parseRequestHead(head: string): ProxyTarget | null {
    const [requestLine = '', ...headerLines] = head.split('\r\n');
    const parts = requestLine.split(' ');
    const [method, target, version] = parts;
    if (parts.length !== 3 || !method || !target || !version?.startsWith('HTTP/1.')) {
        return null;
    }

    if (method === 'CONNECT') {
        const authority = parseAuthority(target);
        return authority && { ...authority, head: null };
    }

    if (!target.startsWith('http://')) {
        return null;
    }
    let url: URL;
    try {
        url = new URL(target);
    } catch {
        return null;
    }
    const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
    const port = url.port ? Number(url.port) : 80;

    const headers = headerLines.filter(line => {
        const name = line.slice(0, line.indexOf(':')).trim().toLowerCase();
        return !DROPPED_HEADERS.has(name);
    });
    if (!headers.some(line => line.toLowerCase().startsWith('host:'))) {
        headers.unshift(`Host: ${url.host}`);
    }
    headers.push('Connection: close');

    const requestHead = [`${method} ${url.pathname}${url.search} ${version}`, ...headers, '', ''].join('\r\n');
    return { host, port, head: requestHead };
}

/** Reads `host:port` or `[ipv6]:port`; `null` when the port is missing or out of range. */
function parseAuthority(authority: string): Pick<ProxyTarget, 'host' | 'port'> | null {
    const match = /^(?:\[([0-9a-fA-F:.]+)\]|([^[\]:]+)):(\d{1,5})$/.exec(authority);
    if (!match) {
        return null;
    }
    const host = match[1] ?? match[2];
    const port = Number(match[3]);
    if (!host || port < 1 || port > 65535) {
        return null;
    }
    return { host, port };
}

function refuse(client: Socket, status: 400 | 403 | 502) {
    const reason = { 400: 'Bad Request', 403: 'Forbidden', 502: 'Bad Gateway' }[status];
    client.end(`HTTP/1.1 ${status} ${reason}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
}

async function resolveAll(host: string) {
    const addresses = await lookup(host, { all: true });
    return addresses.map(entry => entry.address);
}

function closeServer(server: Server) {
    return new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
    });
}
