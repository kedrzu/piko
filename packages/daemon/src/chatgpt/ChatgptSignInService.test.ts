import os from 'node:os';

import { expect, mock, test } from 'bun:test';

import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';
import { waitUntil } from '@nzyme/utils/waitUntil.js';

import type { AiProvider } from '@poweragents/common/api/AiTypes.js';
import type { ChatgptLoginState, ChatgptStatus } from '@poweragents/common/api/ChatgptTypes.js';
import { OpencodeIntegrationGetCommand } from '@poweragents/opencode/OpencodeIntegrationGetCommand.js';
import type { OpencodeIntegration } from '@poweragents/opencode/OpencodeIntegrationGetCommand.js';
import { OpencodeIntegrationOauthCancelCommand } from '@poweragents/opencode/OpencodeIntegrationOauthCancelCommand.js';
import type { OpencodeIntegrationOauthCancelCommandParams } from '@poweragents/opencode/OpencodeIntegrationOauthCancelCommand.js';
import { OpencodeIntegrationOauthStartCommand } from '@poweragents/opencode/OpencodeIntegrationOauthStartCommand.js';
import type {
    OpencodeIntegrationOauthStartCommandParams,
    OpencodeIntegrationOauthStartCommandResult,
} from '@poweragents/opencode/OpencodeIntegrationOauthStartCommand.js';
import { OpencodeIntegrationOauthStatusCommand } from '@poweragents/opencode/OpencodeIntegrationOauthStatusCommand.js';
import type { OpencodeIntegrationOauthStatus } from '@poweragents/opencode/OpencodeIntegrationOauthStatusCommand.js';

import { ActiveProviderStore } from '../ai/ActiveProviderStore.js';
import { Sandbox } from '../sandbox/Sandbox.js';
import type { SandboxExecParams, SandboxProcess, SandboxState } from '../sandbox/Sandbox.js';
import { ChatgptSignInService } from './ChatgptSignInService.js';

// The relay is a real server on a free port of this computer, driven with `fetch` as the browser would. The sandbox's
// `exec` is the boundary behind it (each `curl` a fake process answering as OpenCode's callback did live), and
// OpenCode's integration commands stand in for its HTTP API.

const CODE = 'Secret4uthCode';
const STATE = 'SecretSt4teOne';
const STATE_2 = 'SecretSt4teTwo';
const STATES = [STATE, STATE_2];
const CURL_COMMAND = ['curl', '--silent', '--show-error', '--max-time', '30', '--include', '--config', '-'];
const CALLBACK_HTML = '<html><body>Signed in. You can close this window.</body></html>';

test('the callback reaches the sandbox off argv, the browser gets its answer, the port closes and the sign-in connects', async () => {
    const fixture = await setup();

    const started = await fixture.chatgpt.startLogin();
    expect(started).toEqual({ url: fixture.attemptUrl(0) });
    const pending: ChatgptLoginState = { state: 'pending', url: fixture.attemptUrl(0) };
    expect(await fixture.chatgpt.getLoginState()).toEqual(pending);

    const response = await fetch(fixture.callbackUrl(STATE));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html');
    expect(await response.text()).toBe(CALLBACK_HTML);
    expect(fixture.curls).toHaveLength(1);
    expect(fixture.curls[0]?.command).toEqual(CURL_COMMAND);
    expect(fixture.curls[0]?.stdinText).toBe(`url = "${fixture.callbackUrl(STATE)}"\n`);
    await expectClosed(fixture.port);
    expect(fixture.setActiveProvider).not.toHaveBeenCalled();

    const connected: ChatgptLoginState = { state: 'connected' };
    expect(await fixture.chatgpt.getLoginState()).toEqual(connected);
    expect(fixture.setActiveProvider).toHaveBeenCalledWith('chatgpt');
    expect(fixture.cancelAttempt).not.toHaveBeenCalled();
    expect(JSON.stringify(fixture.logs)).not.toContain(CODE);
    expect(JSON.stringify(fixture.logs)).not.toContain(STATE);
});

test('other paths, methods and states are refused without reaching the sandbox, and the relay keeps waiting', async () => {
    const fixture = await setup();
    await fixture.chatgpt.startLogin();

    const favicon = await fetch(`http://127.0.0.1:${fixture.port}/favicon.ico`);
    const wrongState = await fetch(fixture.callbackUrl('forged'));
    const noState = await fetch(`http://127.0.0.1:${fixture.port}/auth/callback?code=${CODE}`);
    const post = await fetch(fixture.callbackUrl(STATE), { method: 'POST' });

    expect([favicon.status, wrongState.status, noState.status, post.status]).toEqual([404, 400, 400, 400]);
    expect(fixture.curls).toHaveLength(0);
    const response = await fetch(fixture.callbackUrl(STATE));
    expect(response.status).toBe(200);
    expect(fixture.curls).toHaveLength(1);
});

test('the relay listens on loopback only, refusing the computer network address', async () => {
    const fixture = await setup();
    const address = Object.values(os.networkInterfaces())
        .flat()
        .find(item => item !== undefined && item.family === 'IPv4' && !item.internal)?.address;
    // A computer without a network address cannot show the difference; failing says so rather than passing blind.
    expect(address).toBeDefined();
    await fixture.chatgpt.startLogin();

    await expect(fetch(`http://${address}:${fixture.port}/favicon.ico`)).rejects.toThrow();
    expect((await fetch(`http://127.0.0.1:${fixture.port}/favicon.ico`)).status).toBe(404);
});

test('a callback the sandbox cannot take answers 502 without echoing it, and stays out of the logs', async () => {
    const fixture = await setup();
    fixture.onCurl = curl => {
        curl.printError(`curl: (7) Failed to connect to ${fixture.callbackUrl(STATE)}\n`);
        curl.exit(7);
    };
    await fixture.chatgpt.startLogin();

    const response = await fetch(fixture.callbackUrl(STATE));

    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).not.toContain(CODE);
    expect(body).not.toContain(STATE);
    expect(fixture.logs.some(log => log.message === 'ChatGPT sign-in callback not forwarded')).toBe(true);
    expect(JSON.stringify(fixture.logs)).not.toContain(CODE);
    expect(JSON.stringify(fixture.logs)).not.toContain(STATE);
});

test('a port taken on the computer fails the start and cancels the attempt in OpenCode', async () => {
    const fixture = await setup();
    const taken = Bun.serve({ hostname: '127.0.0.1', port: fixture.port, fetch: () => new Response('other app') });

    try {
        await expect(fixture.chatgpt.startLogin()).rejects.toThrow();
        expect(fixture.cancelAttempt).toHaveBeenCalledWith({ integrationId: 'openai', attemptId: 'attempt_0' });
        const expired: ChatgptLoginState = { state: 'expired' };
        expect(await fixture.chatgpt.getLoginState()).toEqual(expired);
    } finally {
        await taken.stop(true);
    }
});

test('a new start ends the waiting sign-in and its relay, and a cancel closes the port', async () => {
    const fixture = await setup();
    await fixture.chatgpt.startLogin();

    // OpenCode's callback port is fixed, so the new relay takes the same port the old one just left.
    const restarted = await fixture.chatgpt.startLogin();

    expect(restarted).toEqual({ url: fixture.attemptUrl(1) });
    expect(fixture.cancelAttempt).toHaveBeenCalledWith({ integrationId: 'openai', attemptId: 'attempt_0' });
    expect((await fetch(fixture.callbackUrl(STATE))).status).toBe(400);

    await fixture.chatgpt.cancelLogin();

    expect(fixture.cancelAttempt).toHaveBeenCalledWith({ integrationId: 'openai', attemptId: 'attempt_1' });
    await expectClosed(fixture.port);
    expect(fixture.curls).toHaveLength(0);
    const expired: ChatgptLoginState = { state: 'expired' };
    expect(await fixture.chatgpt.getLoginState()).toEqual(expired);
});

test('a cancel with the sandbox no longer ready still closes the port, skipping only OpenCode', async () => {
    const fixture = await setup();
    await fixture.chatgpt.startLogin();
    fixture.setSandboxState({ status: 'stopping' });

    await fixture.chatgpt.cancelLogin();

    await expectClosed(fixture.port);
    expect(fixture.cancelAttempt).not.toHaveBeenCalled();
});

test('a sign-in OpenCode no longer knows, or reports expired, reads as expired and closes the port', async () => {
    const statuses: (OpencodeIntegrationOauthStatus | undefined)[] = [undefined, { status: 'expired' }];
    for (const status of statuses) {
        const fixture = await setup();
        await fixture.chatgpt.startLogin();
        fixture.opencode.attemptStatus = status;

        const expired: ChatgptLoginState = { state: 'expired' };
        expect(await fixture.chatgpt.getLoginState()).toEqual(expired);
        await expectClosed(fixture.port);
        expect(fixture.setActiveProvider).not.toHaveBeenCalled();
    }
});

test('a sign-in that times out is cancelled and its port closed', async () => {
    const fixture = await setup({ expiresInMs: 50 });
    await fixture.chatgpt.startLogin();

    await expectClosed(fixture.port);

    await waitUntil(() => fixture.cancelAttempt.mock.calls.length > 0, { intervalMs: 10, timeoutMs: 2000 });
    expect(fixture.cancelAttempt).toHaveBeenCalledWith({ integrationId: 'openai', attemptId: 'attempt_0' });
    const expired: ChatgptLoginState = { state: 'expired' };
    expect(await fixture.chatgpt.getLoginState()).toEqual(expired);
});

test('a failed sign-in is logged without its code and state, and is not recorded as the active provider', async () => {
    const fixture = await setup();
    await fixture.chatgpt.startLogin();
    await fetch(fixture.callbackUrl(STATE));
    fixture.opencode.attemptStatus = {
        status: 'failed',
        message: `Token exchange failed for code=${CODE}&state=${STATE}`,
    };

    const failed: ChatgptLoginState = { state: 'failed' };
    expect(await fixture.chatgpt.getLoginState()).toEqual(failed);
    expect(fixture.logs.some(log => log.message === 'ChatGPT sign-in failed')).toBe(true);
    expect(JSON.stringify(fixture.logs)).not.toContain(CODE);
    expect(JSON.stringify(fixture.logs)).not.toContain(STATE);
    expect(fixture.setActiveProvider).not.toHaveBeenCalled();
});

test('reports whether the openai integration is connected, waiting for OpenCode to load it', async () => {
    const fixture = await setup();
    const integrations: (OpencodeIntegration | undefined)[] = [
        undefined,
        { id: 'openai', name: 'OpenAI', connected: false },
        { id: 'openai', name: 'OpenAI', connected: true },
    ];
    fixture.getIntegration.mockImplementation(() => Promise.resolve(integrations.shift()));

    const signedOut: ChatgptStatus = { connected: false };
    const signedIn: ChatgptStatus = { connected: true };
    expect(await fixture.chatgpt.getStatus()).toEqual(signedOut);
    expect(await fixture.chatgpt.getStatus()).toEqual(signedIn);
    expect(fixture.getIntegration).toHaveBeenCalledWith('openai');
});

test('refuses to work while the sandbox is not ready', async () => {
    const fixture = await setup({ sandboxState: { status: 'startingAgent' } });

    await expect(fixture.chatgpt.startLogin()).rejects.toMatchObject({ status: 409 });
    expect(fixture.startAttempt).not.toHaveBeenCalled();
});

interface SetupOptions {
    sandboxState?: SandboxState;
    /** When OpenCode says each attempt expires, from its start; none when absent. */
    expiresInMs?: number;
}

interface FakeOpencode {
    /** What OpenCode reports for the current attempt; `undefined` when it does not know it. */
    attemptStatus: OpencodeIntegrationOauthStatus | undefined;
}

interface FakeCurl extends FakeProcess {
    command: string[];
    stdinText: string;
}

async function setup(options: SetupOptions = {}) {
    const { container, logs } = createTestContainer();
    const port = await findFreePort();
    const curls: FakeCurl[] = [];
    const opencode: FakeOpencode = { attemptStatus: { status: 'pending' } };
    let state: SandboxState = options.sandboxState ?? {
        status: 'ready',
        endpoint: { url: 'http://127.0.0.1:1', username: 'opencode', password: 'x' },
    };
    const startAttempt = mock(
        (_params: OpencodeIntegrationOauthStartCommandParams): Promise<OpencodeIntegrationOauthStartCommandResult> => {
            const index = startAttempt.mock.calls.length - 1;
            fixture.opencode.attemptStatus = { status: 'pending' };
            return Promise.resolve({
                attemptId: `attempt_${index}`,
                url: attemptUrl(index),
                expiresAt: options.expiresInMs != null ? Date.now() + options.expiresInMs : undefined,
            });
        },
    );
    const cancelAttempt = mock((_params: OpencodeIntegrationOauthCancelCommandParams) => Promise.resolve());
    const getIntegration = mock((_id: string): Promise<OpencodeIntegration | undefined> =>
        Promise.resolve({ id: 'openai', name: 'OpenAI', connected: false }),
    );
    // The real store writes into the user's `~/.poweragents`; the record is asserted through this fake.
    const setActiveProvider = mock((_provider: AiProvider) => Promise.resolve());

    container.set(Sandbox, {
        getState: () => state,
        getVerifiedState: () => Promise.resolve(state),
        stateChanged: createEventEmitter<[state: SandboxState]>().event,
        start: () => Promise.reject(new Error('not used')),
        stop: () => Promise.resolve(),
        exec,
    });
    container.set(ActiveProviderStore, { get: () => Promise.resolve(undefined), set: setActiveProvider });
    container.set(OpencodeIntegrationGetCommand, getIntegration);
    container.set(OpencodeIntegrationOauthStartCommand, startAttempt);
    container.set(OpencodeIntegrationOauthStatusCommand, () => Promise.resolve(fixture.opencode.attemptStatus));
    container.set(OpencodeIntegrationOauthCancelCommand, cancelAttempt);

    const fixture = {
        logs,
        port,
        curls,
        startAttempt,
        cancelAttempt,
        getIntegration,
        setActiveProvider,
        attemptUrl,
        callbackUrl,
        opencode,
        setSandboxState: (next: SandboxState) => {
            state = next;
        },
        /** What OpenCode's callback, reached by `curl` in the sandbox, answers; by default it completes the sign-in. */
        onCurl: (curl: FakeCurl) => {
            curl.print(
                `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nTransfer-Encoding: chunked\r\n\r\n${CALLBACK_HTML}`,
            );
            curl.exit(0);
            fixture.opencode.attemptStatus = { status: 'complete' };
        },
        chatgpt: container.resolve(ChatgptSignInService),
    };
    return fixture;

    /** OpenAI's sign-in page as OpenCode returned it live, for the `index`-th attempt. */
    function attemptUrl(index: number) {
        const redirectUri = encodeURIComponent(`http://127.0.0.1:${port}/auth/callback`);
        return `https://auth.openai.com/api/accounts/authorize?response_type=code&client_id=app_x&redirect_uri=${redirectUri}&scope=openid&state=${STATES[index]}`;
    }

    /** The browser's return from OpenAI's page, with the params it carried live. */
    function callbackUrl(callbackState: string) {
        return `http://127.0.0.1:${port}/auth/callback?code=${CODE}&scope=openid&state=${callbackState}&client_id=app_x`;
    }

    function exec(params: SandboxExecParams): SandboxProcess {
        if (params.command[0] !== 'curl') {
            throw new Error(`Unexpected command: ${params.command.join(' ')}`);
        }

        const curl: FakeCurl = Object.assign(createFakeProcess(), { command: params.command, stdinText: '' });
        curls.push(curl);
        curl.process.stdin = {
            write: chunk => {
                curl.stdinText += String(chunk);
            },
            end: () => fixture.onCurl(curl),
        };
        return curl.process;
    }
}

/** A port nothing listens on: the one the system gave a server that is closed again. */
async function findFreePort() {
    const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
    const port = probe.port;
    await probe.stop(true);
    if (port === undefined) {
        throw new Error('No port');
    }
    return port;
}

/** Waits until nothing listens on the port: a fresh connection is refused. */
async function expectClosed(port: number) {
    await waitUntil(
        async () => {
            try {
                await fetch(`http://127.0.0.1:${port}/`, { headers: { Connection: 'close' } });
                return false;
            } catch {
                return true;
            }
        },
        { intervalMs: 20, timeoutMs: 2000 },
    );
}

interface FakeProcess {
    process: SandboxProcess;
    print(text: string): void;
    printError(text: string): void;
    exit(code: number): void;
}

function createFakeProcess(): FakeProcess {
    const encoder = new TextEncoder();
    let stdout!: ReadableStreamDefaultController<Uint8Array>;
    let stderr!: ReadableStreamDefaultController<Uint8Array>;
    let resolveExit!: (code: number) => void;

    return {
        process: {
            stdin: { write: () => {}, end: () => {} },
            stdout: new ReadableStream({ start: controller => void (stdout = controller) }),
            stderr: new ReadableStream({ start: controller => void (stderr = controller) }),
            exited: new Promise(resolve => {
                resolveExit = resolve;
            }),
            kill: () => {},
        },
        print: text => stdout.enqueue(encoder.encode(text)),
        printError: text => stderr.enqueue(encoder.encode(text)),
        exit: code => {
            stdout.close();
            stderr.close();
            resolveExit(code);
        },
    };
}
