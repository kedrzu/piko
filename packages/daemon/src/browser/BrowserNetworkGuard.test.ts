import { connect, createServer } from 'node:net';
import type { Socket } from 'node:net';

import { afterEach, expect, test } from 'bun:test';

import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

import { BrowserDestinations, BrowserNetworkGuard } from './BrowserNetworkGuard.js';
import type { BrowserDestinationPolicy } from './BrowserNetworkGuard.js';
import { isPublicAddress } from './isPublicAddress.js';

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) {
        await cleanup();
    }
});

test.each([
    ['CONNECT to a loopback literal', (port: number) => `CONNECT 127.0.0.1:${port} HTTP/1.1\r\n\r\n`],
    ['CONNECT to bracketed IPv6 loopback', (port: number) => `CONNECT [::1]:${port} HTTP/1.1\r\n\r\n`],
    ['CONNECT to an IPv4-mapped loopback', (port: number) => `CONNECT [::ffff:7f00:1]:${port} HTTP/1.1\r\n\r\n`],
    [
        'GET to a loopback literal',
        (port: number) => `GET http://127.0.0.1:${port}/ HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`,
    ],
    [
        'GET to an IPv4-mapped loopback',
        (port: number) => `GET http://[::ffff:127.0.0.1]:${port}/ HTTP/1.1\r\nHost: x\r\n\r\n`,
    ],
    ['GET to a decimal loopback', (port: number) => `GET http://2130706433:${port}/ HTTP/1.1\r\nHost: x\r\n\r\n`],
    ['CONNECT to a name resolving to loopback', (port: number) => `CONNECT intranet.test:${port} HTTP/1.1\r\n\r\n`],
    [
        'GET to a name resolving to loopback',
        (port: number) => `GET http://intranet.test:${port}/ HTTP/1.1\r\nHost: intranet.test\r\n\r\n`,
    ],
    [
        'CONNECT to a name resolving to a public and a private address',
        (port: number) => `CONNECT mixed.test:${port} HTTP/1.1\r\n\r\n`,
    ],
])('refuses %s with 403 and never reaches it', async (_name, buildRequest) => {
    const target = await startEchoServer();
    const proxyPort = await startProxy({
        resolve: host => Promise.resolve(RESOLVED[host] ?? []),
        isAllowed: isPublicAddress,
    });

    const response = await exchange(proxyPort, buildRequest(target.port));

    expect(response).toStartWith('HTTP/1.1 403 Forbidden\r\n');
    expect(target.connections()).toBe(0);
});

test('refuses localhost through the system resolver', async () => {
    const target = await startEchoServer();
    const { container, logs } = createTestContainer();
    const server = await container.resolve(BrowserNetworkGuard).listen(0);
    cleanups.push(() => server.close());

    const response = await exchange(server.port, `GET http://localhost:${target.port}/secret HTTP/1.1\r\n\r\n`);

    expect(response).toStartWith('HTTP/1.1 403 Forbidden\r\n');
    expect(target.connections()).toBe(0);
    const refusal = logs.find(log => log.message === 'The browser proxy refused a destination');
    expect(refusal?.level).toBe('debug');
    expect(refusal?.data).toEqual({ host: 'localhost' });
});

test.each([
    ['an origin-form request', 'GET /path HTTP/1.1\r\nHost: example.com\r\n\r\n'],
    ['a CONNECT without a port', 'CONNECT example.com HTTP/1.1\r\n\r\n'],
    ['an https absolute-form request', 'GET https://example.com/ HTTP/1.1\r\n\r\n'],
    ['garbage', 'hello\r\n\r\n'],
    ['an oversized head', `GET http://example.com/ HTTP/1.1\r\nX-Big: ${'a'.repeat(17 * 1024)}\r\n\r\n`],
])('answers %s with 400', async (_name, request) => {
    const resolve = () => Promise.resolve(['1.1.1.1']);
    const proxyPort = await startProxy({ resolve, isAllowed: isPublicAddress });

    const response = await exchange(proxyPort, request);

    expect(response).toStartWith('HTTP/1.1 400 Bad Request\r\n');
});

test('tunnels CONNECT both ways to the address it checked', async () => {
    const target = await startEchoServer();
    // `allowed.test` does not resolve on any real resolver: reaching the server proves the socket used the checked address.
    const proxyPort = await startProxy({
        resolve: host => Promise.resolve(host === 'allowed.test' ? ['127.0.0.1'] : []),
        isAllowed: address => address === '127.0.0.1',
    });

    const socket = connect(proxyPort, '127.0.0.1');
    cleanups.push(() => void socket.destroy());
    const reader = readFrom(socket);
    socket.write(`CONNECT allowed.test:${target.port} HTTP/1.1\r\nHost: allowed.test:${target.port}\r\n\r\n`);
    expect(await reader.until('\r\n\r\n')).toBe('HTTP/1.1 200 Connection Established\r\n\r\n');

    socket.write('ping');
    expect(await reader.until('pong:ping')).toBe('pong:ping');
    expect(target.connections()).toBe(1);
});

test('forwards an absolute-form request in origin form without proxy headers', async () => {
    const seen: { path: string; body: string; headers: Record<string, string> }[] = [];
    const origin = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        async fetch(request) {
            const url = new URL(request.url);
            seen.push({
                path: url.pathname + url.search,
                body: await request.text(),
                headers: Object.fromEntries(request.headers),
            });
            return new Response('hello from origin');
        },
    });
    cleanups.push(() => origin.stop(true));
    const proxyPort = await startProxy({
        resolve: () => Promise.resolve([]),
        isAllowed: address => address === '127.0.0.1',
    });

    const response = await exchange(
        proxyPort,
        [
            `POST http://127.0.0.1:${origin.port}/form?x=1 HTTP/1.1`,
            `Host: 127.0.0.1:${origin.port}`,
            'Proxy-Connection: keep-alive',
            'Proxy-Authorization: Basic c2VjcmV0',
            'Content-Length: 4',
            '',
            'body',
        ].join('\r\n'),
    );

    expect(response).toStartWith('HTTP/1.1 200 OK\r\n');
    expect(response).toEndWith('hello from origin');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.path).toBe('/form?x=1');
    expect(seen[0]?.body).toBe('body');
    expect(seen[0]?.headers['connection']).toBe('close');
    expect(seen[0]?.headers['proxy-connection']).toBeUndefined();
    expect(seen[0]?.headers['proxy-authorization']).toBeUndefined();
});

/** What the stub resolver answers for each test name. */
const RESOLVED: Record<string, string[]> = {
    'intranet.test': ['127.0.0.1'],
    'mixed.test': ['1.1.1.1', '127.0.0.1'],
};

async function startProxy(destinations: BrowserDestinationPolicy) {
    const { container } = createTestContainer();
    container.set(BrowserDestinations, destinations);
    const server = await container.resolve(BrowserNetworkGuard).listen(0);
    cleanups.push(() => server.close());
    return server.port;
}

/** A TCP server answering `pong:<data>`, counting the connections it gets. */
async function startEchoServer() {
    let connections = 0;
    const sockets = new Set<Socket>();
    const server = createServer(socket => {
        connections++;
        sockets.add(socket);
        socket.on('data', data => socket.write(`pong:${data.toString()}`));
        socket.on('close', () => sockets.delete(socket));
    });
    await new Promise<void>(resolve => {
        server.listen(0, '127.0.0.1', resolve);
    });
    cleanups.push(async () => {
        for (const socket of sockets) {
            socket.destroy();
        }
        await new Promise(resolve => {
            server.close(resolve);
        });
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('The echo server has no port');
    }
    return { port: address.port, connections: () => connections };
}

/** Sends a request to the proxy and reads everything until the proxy closes the connection. */
async function exchange(proxyPort: number, request: string) {
    const socket = connect(proxyPort, '127.0.0.1');
    cleanups.push(() => void socket.destroy());
    let response = '';
    socket.on('data', data => (response += data.toString('latin1')));
    socket.write(request);
    await new Promise(resolve => {
        socket.on('close', resolve);
    });
    return response;
}

/** Reads from a socket chunk by chunk; `until()` waits for a marker and returns what came up to it. */
function readFrom(socket: Socket) {
    let buffered = '';
    const waiting = new Set<() => void>();
    socket.on('data', data => {
        buffered += data.toString('latin1');
        for (const wake of waiting) {
            wake();
        }
        waiting.clear();
    });
    return { until };

    async function until(marker: string) {
        while (!buffered.includes(marker)) {
            await nextChunk();
        }
        const end = buffered.indexOf(marker) + marker.length;
        const result = buffered.slice(0, end);
        buffered = buffered.slice(end);
        return result;
    }

    function nextChunk() {
        return new Promise<void>(resolve => {
            waiting.add(resolve);
        });
    }
}
