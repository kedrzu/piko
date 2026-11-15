import { expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { HttpError } from '@nzyme/fetch-utils/HttpError.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import type { RpcErrorData } from '@nzyme/rpc/types/RpcError.js';
import { assert } from '@nzyme/utils/assert.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';

import type { DaemonEvent } from '@poweragents/common/api/DaemonEventTypes.js';
import type { ProjectFileContentResult } from '@poweragents/common/api/ProjectFileTypes.js';
import type { SandboxStatus } from '@poweragents/common/api/SandboxTypes.js';
import { OpencodeEventSubscribeCommand } from '@poweragents/opencode/OpencodeEventSubscribeCommand.js';
import type { OpencodeEvent } from '@poweragents/opencode/OpencodeEventSubscribeCommand.js';
import { readSseData } from '@poweragents/opencode/utils/readSseData.js';

import { ProjectService } from '../projects/ProjectService.js';
import { Sandbox } from '../sandbox/Sandbox.js';
import type { SandboxState } from '../sandbox/Sandbox.js';
import { ApiService } from './ApiService.js';
import type { ApiServiceShape } from './ApiService.js';

const PASSWORD = 'agent-password-must-not-leave-7c2e';
const STATUS_URL = 'http://127.0.0.1:47610/api/sandbox/status';
const EVENTS_URL = 'http://127.0.0.1:47610/api/events';

test('serves the app: the shell origin gets the status, without the agent password', async () => {
    const { api } = setup();

    const response = await api.handle(
        new Request(STATUS_URL, {
            method: 'POST',
            headers: { Origin: 'tauri://localhost', 'Content-Type': 'application/json' },
        }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('tauri://localhost');
    const expected: SandboxStatus = { status: 'ready' };
    expect(JSON.parse(body)).toEqual(expected);
    expect(body).not.toContain(PASSWORD);
});

test('streams changes in the data root beside the conversation events', async () => {
    const { api, dataRoot } = setup();

    const response = await api.handle(new Request(EVENTS_URL, { headers: { Origin: 'tauri://localhost' } }));
    const frames = readFrames(response, 1);
    // macOS reports nothing that happened before the new watcher's stream got going.
    await Bun.sleep(300);
    await mkdir(path.join(dataRoot, 'memory'));
    await writeFile(path.join(dataRoot, 'memory', 'praca.md'), '# Praca\n');

    const expected: DaemonEvent[] = [{ type: 'memoryChanged' }];
    expect((await frames).map((frame): unknown => JSON.parse(frame))).toEqual(expected);
});

test.each([
    ['a foreign origin', { Origin: 'https://evil.example' }],
    ['no origin', {}],
])('refuses a request with %s', async (_case, headers: Record<string, string>) => {
    const { api } = setup();

    const response = await api.handle(new Request(STATUS_URL, { method: 'POST', headers }));

    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('ready');
});

test.each([
    ['an unexpected failure', new TypeError('limactl: no such instance'), 500, 'TypeError'],
    ['an HttpError', new HttpError(409, { error: 'SandboxNotReady', message: 'Not ready' }), 409, 'SandboxNotReady'],
])('answers %s with its name and message, without the stack', async (_case, failure, status, name) => {
    const { api } = setup([], () => Promise.reject(failure));

    const response = await api.handle(
        new Request(STATUS_URL, { method: 'POST', headers: { Origin: 'tauri://localhost' } }),
    );

    const expected: RpcErrorData = { error: name, message: failure.message };
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(expected);
});

test('logs an unexpected failure whole', async () => {
    const failure = new TypeError('limactl: no such instance');
    const { api, logs } = setup([], () => Promise.reject(failure));

    await api.handle(new Request(STATUS_URL, { method: 'POST', headers: { Origin: 'tauri://localhost' } }));

    expect(logs.find(log => log.message === 'API request failed')?.data).toEqual({ error: failure });
});

test("serves a project's files: lists, reads and writes them, refusing an unknown project and a malformed body", async () => {
    const { api, container, dataRoot } = setup();
    const created = await container.resolve(ProjectService).create('Projekt');
    assert('created' in created);
    const projectId = created.created.id;
    await writeFile(path.join(dataRoot, 'projects', 'Projekt', 'plan.md'), '# Plan\n');
    const version = createHash('sha256').update('# Plan\n').digest('hex');

    const list = await post(api, 'files/list', { projectId });
    const write = await post(api, 'files/write', { projectId, path: 'plan.md', content: '# Nowy\n', version });
    const read = await post(api, 'files/read', { projectId, path: 'plan.md' });
    const unknown = await post(api, 'files/content', { projectId: 'unknown', path: 'plan.md' });
    const malformed = await post(api, 'files/locate', { projectId });

    expect(await list.json()).toMatchObject({ entries: [{ name: 'plan.md', kind: 'file' }] });
    expect(await write.json()).toMatchObject({
        written: { version: createHash('sha256').update('# Nowy\n').digest('hex') },
    });
    expect(await read.json()).toMatchObject({ text: { content: '# Nowy\n' } });
    const notFound: ProjectFileContentResult = { notFound: true };
    expect(await unknown.json()).toEqual(notFound);
    expect(malformed.status).toBe(400);
});

test('answers the CORS preflight only for the app origins', async () => {
    const { api } = setup();

    const foreign = await api.handle(preflight('https://evil.example'));
    const shell = await api.handle(preflight('tauri://localhost'));
    const dev = await api.handle(preflight('http://localhost:4100'));

    expect(foreign.status).toBe(403);
    expect(foreign.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(shell.status).toBe(204);
    expect(shell.headers.get('Access-Control-Allow-Origin')).toBe('tauri://localhost');
    expect(dev.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4100');
});

test('streams conversation events to the app, without the agent password, the tool output or the provider body', async () => {
    const { api, logs } = setup([
        { type: 'runStarted', sessionId: 'ses_1' },
        { type: 'toolStarted', sessionId: 'ses_1', callId: 'call_1', name: 'shell', input: { command: 'env' } },
        // The agent's container holds the password in its environment, so a tool may well print it.
        {
            type: 'toolFinished',
            sessionId: 'ses_1',
            callId: 'call_1',
            name: 'shell',
            output: [{ type: 'text', text: `OPENCODE_SERVER_PASSWORD=${PASSWORD}` }],
        },
        {
            type: 'runFinished',
            sessionId: 'ses_1',
            outcome: 'failed',
            error: { kind: 'ProviderError', message: 'Bad request', httpStatus: 400, responseBody: PASSWORD },
        },
    ]);

    const response = await api.handle(new Request(EVENTS_URL, { headers: { Origin: 'http://localhost:4100' } }));
    const frames = await readFrames(response, 5);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4100');
    const expected: DaemonEvent[] = [
        { type: 'runningChanged', conversationId: 'ses_1', running: true },
        {
            type: 'stepStarted',
            conversationId: 'ses_1',
            step: { id: 'call_1', kind: 'runCommand', target: 'env', status: 'running' },
        },
        { type: 'stepFinished', conversationId: 'ses_1', stepId: 'call_1' },
        {
            type: 'runFinished',
            conversationId: 'ses_1',
            outcome: 'failed',
            error: { kind: 'other', message: 'Bad request' },
        },
        { type: 'runningChanged', conversationId: 'ses_1', running: false },
    ];
    expect(frames.map((frame): unknown => JSON.parse(frame))).toEqual(expected);
    expect(frames.join('\n')).not.toContain(PASSWORD);
    expect(JSON.stringify(logs.map(log => [log.message, log.data]))).not.toContain(PASSWORD);
});

test.each([
    ['a foreign origin', { Origin: 'https://evil.example' }],
    ['no origin', {}],
])('refuses the event stream to a request with %s', async (_case, headers: Record<string, string>) => {
    const { api, subscribe } = setup([{ type: 'runStarted', sessionId: 'ses_1' }]);

    const response = await api.handle(new Request(EVENTS_URL, { headers }));

    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(subscribe).not.toHaveBeenCalled();
});

function setup(agentEvents: OpencodeEvent[] = [], getVerifiedState?: () => Promise<SandboxState>) {
    const { container, logs } = createTestContainer();
    // The event stream watches the data root: a fresh one, never the person's.
    const dataRoot = mkdtempSync(path.join(os.tmpdir(), 'poweragents-api-'));
    container.set(EnvVariables, { POWERAGENTS_DATA_ROOT: dataRoot });
    const state: SandboxState = {
        status: 'ready',
        endpoint: { url: 'http://127.0.0.1:1', username: 'opencode', password: PASSWORD },
    };
    container.set(Sandbox, {
        getState: () => state,
        getVerifiedState: getVerifiedState ?? (() => Promise.resolve(state)),
        stateChanged: createEventEmitter<[state: SandboxState]>().event,
        start: () => Promise.resolve(state.endpoint),
        stop: () => Promise.resolve(),
        exec: () => {
            throw new Error('not used');
        },
    });
    // The agent's feed sends its events, then stays open.
    const subscribe = mock(async function* (_signal: AbortSignal) {
        yield* agentEvents;
        await Promise.withResolvers<void>().promise;
    });
    container.set(OpencodeEventSubscribeCommand, subscribe);
    return { api: container.resolve(ApiService), container, logs, subscribe, dataRoot };
}

/** Reads the `data` of `count` events from a server-sent events response (skipping comments), then disconnects. */
async function readFrames(response: Response, count: number) {
    const frames: string[] = [];
    for await (const data of readSseData(response.body!)) {
        frames.push(data);
        if (frames.length === count) {
            break;
        }
    }
    return frames;
}

function post(api: ApiServiceShape, endpoint: string, body: object) {
    return api.handle(
        new Request(`http://127.0.0.1:47610/api/${endpoint}`, {
            method: 'POST',
            headers: { Origin: 'tauri://localhost', 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }),
    );
}

function preflight(origin: string) {
    return new Request(STATUS_URL, {
        method: 'OPTIONS',
        headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type',
        },
    });
}
