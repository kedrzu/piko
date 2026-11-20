import { expect, mock, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { Container } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { assert } from '@nzyme/utils/assert.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';

import type { DaemonEvent, FileAgentChangedEvent } from '@piko/common/api/DaemonEventTypes.js';
import { OpencodeEventSubscribeCommand } from '@piko/opencode/OpencodeEventSubscribeCommand.js';
import type { OpencodeEvent } from '@piko/opencode/OpencodeEventSubscribeCommand.js';
import { OpencodeSessionGetCommand } from '@piko/opencode/OpencodeSessionGetCommand.js';
import type { OpencodeSession } from '@piko/opencode/OpencodeTypes.js';

import { FileAgentStateService } from '../files/FileAgentStateService.js';
import { ProjectService } from '../projects/ProjectService.js';
import { Sandbox } from '../sandbox/Sandbox.js';
import type { SandboxState } from '../sandbox/Sandbox.js';
import { ConversationEventService } from './ConversationEventService.js';
import type { ConversationEventServiceShape } from './ConversationEventService.js';

// OpenCode's event subscription is the boundary; projects are real folders in a fresh temporary data root.

test("tags a new conversation with its project, and skips the agent's sub-sessions and folders that are no project", async () => {
    const { container, feeds } = await setup();
    const created = await container.resolve(ProjectService).create('Alfa');
    assert('created' in created);
    feeds.push([
        { type: 'sessionCreated', sessionId: 'ses_sub', directory: '/Piko/projects/Alfa', parentId: 'ses_1' },
        { type: 'sessionCreated', sessionId: 'ses_x', directory: '/Piko/projects/Próba' },
        { type: 'sessionCreated', sessionId: 'ses_1', directory: '/Piko/projects/Alfa' },
    ]);

    const events = await collect(container.resolve(ConversationEventService), 1);

    const expected: DaemonEvent[] = [
        { type: 'conversationCreated', conversationId: 'ses_1', projectId: created.created.id },
    ];
    expect(events).toEqual(expected);
});

test('reconnects after the feed fails and says the stream was restored as soon as it is open again', async () => {
    const { container, feeds, logs } = await setup();
    // The reconnected feed sends nothing: the gap is reported anyway.
    feeds.push(new Error('connection reset'), []);

    const events = await collect(container.resolve(ConversationEventService), 1);

    const expected: DaemonEvent[] = [{ type: 'streamRestored' }];
    expect(events).toEqual(expected);
    expect(logs.some(log => log.message === 'Agent event feed failed, reconnecting')).toBe(true);
});

test('drops a listener that throws, and keeps the feed for the others', async () => {
    const { container, feeds, subscribe } = await setup();
    feeds.push([
        { type: 'runStarted', sessionId: 'ses_1' },
        { type: 'runStarted', sessionId: 'ses_2' },
    ]);
    const service = container.resolve(ConversationEventService);
    let thrown = 0;
    service.listen(() => {
        thrown++;
        throw new Error('stream closed');
    });

    const events = await collect(service, 2);

    const expected: DaemonEvent[] = [
        { type: 'runningChanged', conversationId: 'ses_1', running: true },
        { type: 'runningChanged', conversationId: 'ses_2', running: true },
    ];
    expect(events).toEqual(expected);
    expect(thrown).toBe(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
});

test("marks the file a tool call writes in a project, by the path in the agent's container, until the call ends", async () => {
    const { container, feeds } = await setup();
    const projectId = await createProject(container, 'Próba');
    feeds.push([
        // Outside every project, and read only: neither is a project file written.
        { type: 'toolStarted', sessionId: 'ses_1', callId: 'c0', name: 'write', input: { path: '/tmp/x.md' } },
        {
            type: 'toolStarted',
            sessionId: 'ses_1',
            callId: 'c1',
            name: 'read',
            input: { path: '/Piko/projects/Próba/a.md' },
        },
        {
            type: 'toolStarted',
            sessionId: 'ses_1',
            callId: 'c2',
            name: 'Edit',
            input: { file_path: '/Piko/projects/Próba/notes/hello.md', old_string: 'a', new_string: 'b' },
        },
        { type: 'toolFinished', sessionId: 'ses_1', callId: 'c2', name: 'Edit', output: [] },
    ]);

    const events = await collectFileAgents(container, 2);

    const file = { type: 'fileAgentChanged', projectId, path: 'notes/hello.md', conversationId: 'ses_1' } as const;
    const expected: FileAgentChangedEvent[] = [
        { ...file, state: 'writing' },
        { ...file, state: null },
    ];
    expect(events).toEqual(expected);
});

test("marks every file in an apply_patch's headers, relative to the session's folder, until the run ends", async () => {
    const { container, feeds, getSession } = await setup();
    const projectId = await createProject(container, 'Alfa');
    // Created before the feed: its folder is asked from the agent.
    getSession.mockImplementation(id => Promise.resolve(id === 'ses_1' ? session(id, '/Piko/projects/Alfa') : null));
    const patchText = [
        '*** Begin Patch',
        '*** Update File: notes/plan.md',
        '@@',
        '-old',
        '+new',
        '*** Add File: /Piko/projects/Alfa/todo.md',
        '+todo',
        '*** Delete File: ../elsewhere.md',
        '*** End Patch',
    ].join('\n');
    feeds.push([
        { type: 'toolStarted', sessionId: 'ses_1', callId: 'c1', name: 'apply_patch', input: { patchText } },
        { type: 'runFinished', sessionId: 'ses_1', outcome: 'succeeded' },
    ]);

    const events = await collectFileAgents(container, 4);

    const expected: FileAgentChangedEvent[] = [
        { type: 'fileAgentChanged', projectId, path: 'notes/plan.md', conversationId: 'ses_1', state: 'writing' },
        { type: 'fileAgentChanged', projectId, path: 'todo.md', conversationId: 'ses_1', state: 'writing' },
        { type: 'fileAgentChanged', projectId, path: 'notes/plan.md', conversationId: 'ses_1', state: null },
        { type: 'fileAgentChanged', projectId, path: 'todo.md', conversationId: 'ses_1', state: null },
    ];
    expect(events).toEqual(expected);
});

test('releases every file the agent was writing when its feed is restored', async () => {
    const { container, feeds } = await setup();
    const projectId = await createProject(container, 'Alfa');
    feeds.push(
        [
            { type: 'sessionCreated', sessionId: 'ses_1', directory: '/Piko/projects/Alfa' },
            { type: 'toolStarted', sessionId: 'ses_1', callId: 'c1', name: 'write', input: { filePath: 'plan.md' } },
            new Error('connection reset'),
        ],
        [],
    );

    const events = await collectFileAgents(container, 2);

    const file = { type: 'fileAgentChanged', projectId, path: 'plan.md', conversationId: 'ses_1' } as const;
    const expected: FileAgentChangedEvent[] = [
        { ...file, state: 'writing' },
        { ...file, state: null },
    ];
    expect(events).toEqual(expected);
});

/**
 * A container whose agent feed plays `feeds` in turn, one per connection: an error fails that connection, a list of
 * events is sent once the connection opens, and it then stays open, unless an error among the events fails it there.
 */
async function setup() {
    const { container, logs } = createTestContainer();
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'piko-conversation-events-'));
    container.set(EnvVariables, { PIKO_DATA_ROOT: path.join(tmp, 'root') });
    const state: SandboxState = {
        status: 'ready',
        endpoint: { url: 'http://127.0.0.1:1', username: 'opencode', password: 'pw' },
    };
    container.set(Sandbox, {
        getState: () => state,
        getVerifiedState: () => Promise.resolve(state),
        stateChanged: createEventEmitter<[state: SandboxState]>().event,
        start: () => Promise.resolve(state.endpoint),
        stop: () => Promise.resolve(),
        exec: () => {
            throw new Error('not used');
        },
        notifySkillsChanged: () => Promise.resolve(),
    });

    const feeds: ((OpencodeEvent | Error)[] | Error)[] = [];
    const subscribe = mock(async function* (_signal: AbortSignal): AsyncGenerator<OpencodeEvent> {
        const feed = feeds.shift();
        if (feed instanceof Error) {
            throw feed;
        }
        yield { type: 'streamOpened' };
        for (const event of feed ?? []) {
            if (event instanceof Error) {
                throw event;
            }
            yield event;
        }
        await Promise.withResolvers<void>().promise;
    });
    container.set(OpencodeEventSubscribeCommand, subscribe);
    const getSession = mock((_id: string): Promise<OpencodeSession | null> => Promise.resolve(null));
    container.set(OpencodeSessionGetCommand, getSession);
    return { container, feeds, getSession, logs, subscribe };
}

/** Listens until `count` events have come. */
async function collect(service: ConversationEventServiceShape, count: number) {
    const events: DaemonEvent[] = [];
    const done = Promise.withResolvers<void>();
    const stop = service.listen(event => {
        events.push(event);
        if (events.length === count) {
            done.resolve();
        }
    });
    await done.promise;
    stop();
    return events;
}

/** Starts the agent's feed and listens to the files it writes until `count` events have come. */
async function collectFileAgents(container: Container, count: number) {
    const stopFeed = container.resolve(ConversationEventService).listen(() => {});
    const events: FileAgentChangedEvent[] = [];
    const done = Promise.withResolvers<void>();
    const stop = container.resolve(FileAgentStateService).listen(event => {
        events.push(event);
        if (events.length === count) {
            done.resolve();
        }
    });
    await done.promise;
    stop();
    stopFeed();
    return events;
}

async function createProject(container: Container, name: string) {
    const created = await container.resolve(ProjectService).create(name);
    assert('created' in created);
    return created.created.id;
}

function session(id: string, directory: string): OpencodeSession {
    return { id, directory, createdAt: 0, updatedAt: 0 };
}
