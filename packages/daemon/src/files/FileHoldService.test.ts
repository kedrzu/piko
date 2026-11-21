import { expect, mock, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { Container } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { assert } from '@nzyme/utils/assert.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';
import { waitUntil } from '@nzyme/utils/waitUntil.js';

import type { FileAgentChangedEvent } from '@piko/common/api/DaemonEventTypes.js';
import { OpencodeEventSubscribeCommand } from '@piko/opencode/OpencodeEventSubscribeCommand.js';
import type { OpencodeEvent } from '@piko/opencode/OpencodeEventSubscribeCommand.js';
import { OpencodePermissionListCommand } from '@piko/opencode/OpencodePermissionListCommand.js';
import type { OpencodePermissionRequest } from '@piko/opencode/OpencodePermissionListCommand.js';
import { OpencodePermissionReplyCommand } from '@piko/opencode/OpencodePermissionReplyCommand.js';
import type { OpencodePermissionReplyCommandParams } from '@piko/opencode/OpencodePermissionReplyCommand.js';
import { OpencodeSessionGetCommand } from '@piko/opencode/OpencodeSessionGetCommand.js';
import type { OpencodeSession } from '@piko/opencode/OpencodeTypes.js';

import { ConversationEventService } from '../conversations/ConversationEventService.js';
import { ProjectFileService } from '../projects/ProjectFileService.js';
import { ProjectService } from '../projects/ProjectService.js';
import { Sandbox } from '../sandbox/Sandbox.js';
import type { SandboxState } from '../sandbox/Sandbox.js';
import { Clock } from '../utils/Clock.js';
import { FileAgentStateService } from './FileAgentStateService.js';
import { FileHoldService, HOLD_MS } from './FileHoldService.js';

// OpenCode (its event feed, its permission list and replies) and the clock are the boundary; projects are real folders
// in a fresh temporary data root, and the person's saves go through `ProjectFileService`. Every session works in the
// project `Próba`, so the agent names its files relative to that folder, as OpenCode does.

test('allows an edit at once when the person has not saved the file, and only opening it holds nothing', async () => {
    const { container, replies } = await setup();
    const projectId = await createProject(container, 'Próba');
    await createFile(container, 'Próba', 'hello.md');
    // Read, as opening it in the app does: no save.
    await container.resolve(ProjectFileService).read({ projectId, path: 'hello.md' });

    await container.resolve(FileHoldService).permissionAsked(edit('per_1', ['hello.md']));

    expect(replies).toEqual([once('per_1')]);
});

test('holds an edit of a file saved within a minute, waiting, and allows it a minute after the last save', async () => {
    const { container, replies, clock, fileEvents } = await setup();
    const projectId = await createProject(container, 'Próba');
    await createFile(container, 'Próba', 'hello.md');
    await save(container, projectId, 'hello.md');
    const holds = container.resolve(FileHoldService);

    clock.advance(10_000);
    await holds.permissionAsked(edit('per_1', ['hello.md']));
    expect(replies).toEqual([]);

    // She saves again 40 s after the first save: the hold ends a minute after this one, not the first.
    clock.advance(30_000);
    await save(container, projectId, 'hello.md');
    clock.advance(HOLD_MS - 1);
    expect(replies).toEqual([]);
    clock.advance(1);
    expect(replies).toEqual([once('per_1')]);

    const file = { type: 'fileAgentChanged', projectId, path: 'hello.md', conversationId: 'ses_1' } as const;
    const expected: FileAgentChangedEvent[] = [
        { ...file, state: 'waiting' },
        { ...file, state: null },
    ];
    expect(fileEvents).toEqual(expected);
});

test('a save more than a minute ago holds nothing', async () => {
    const { container, replies, clock } = await setup();
    const projectId = await createProject(container, 'Próba');
    await createFile(container, 'Próba', 'hello.md');
    await save(container, projectId, 'hello.md');

    clock.advance(HOLD_MS);
    await container.resolve(FileHoldService).permissionAsked(edit('per_1', ['/Piko/projects/Próba/hello.md']));

    expect(replies).toEqual([once('per_1')]);
});

test('releasing the file allows its held edit at once, and the next edit of it is not held', async () => {
    const { container, replies } = await setup();
    const projectId = await createProject(container, 'Próba');
    await createFile(container, 'Próba', 'hello.md');
    await save(container, projectId, 'hello.md');
    const holds = container.resolve(FileHoldService);
    await holds.permissionAsked(edit('per_1', ['hello.md']));

    const released = await holds.release({ projectId, path: 'hello.md' });
    await holds.permissionAsked(edit('per_2', ['hello.md']));

    expect(released).toBe(true);
    expect(replies).toEqual([once('per_1'), once('per_2')]);
    // Nothing held it any more.
    expect(await holds.release({ projectId, path: 'hello.md' })).toBe(false);
});

test('the end of the run answers its held edits only', async () => {
    const { container, replies } = await setup();
    const projectId = await createProject(container, 'Próba');
    await createFile(container, 'Próba', 'hello.md');
    await save(container, projectId, 'hello.md');
    const holds = container.resolve(FileHoldService);
    await holds.permissionAsked(edit('per_1', ['hello.md']));
    await holds.permissionAsked(edit('per_2', ['hello.md'], 'ses_2'));

    await holds.runEnded('ses_1');

    expect(replies).toEqual([once('per_1')]);
});

test('allows at once what is no edit of a project file the person saved', async () => {
    const { container, replies } = await setup();
    const projectId = await createProject(container, 'Próba');
    await createFile(container, 'Próba', 'hello.md');
    await save(container, projectId, 'hello.md');
    const holds = container.resolve(FileHoldService);

    // Another action on the same file; a path outside every project; a session whose folder is unknown.
    await holds.permissionAsked({ ...edit('per_1', ['hello.md']), action: 'bash' });
    await holds.permissionAsked(edit('per_2', ['/tmp/hello.md']));
    await holds.permissionAsked(edit('per_3', ['hello.md'], 'ses_unknown'));

    expect(replies).toEqual([once('per_1'), once('per_2'), once('per_3', 'ses_unknown')]);
});

test('a reply to a request that is gone or fails throws nothing', async () => {
    const { container, reply, logs } = await setup();
    await createProject(container, 'Próba');
    const holds = container.resolve(FileHoldService);

    reply.mockImplementationOnce(() => Promise.resolve('notFound'));
    await holds.permissionAsked(edit('per_1', ['hello.md']));
    reply.mockImplementationOnce(() => Promise.reject(new Error('connection refused')));
    await holds.permissionAsked(edit('per_2', ['hello.md']));

    expect(logs.some(log => log.message === 'Agent permission could not be answered')).toBe(true);
});

test("answers the agent's requests from the daemon's start, with no client listening", async () => {
    const { container, replies, feeds } = await setup();
    await createProject(container, 'Próba');
    feeds.push([{ type: 'permissionAsked', ...edit('per_1', ['hello.md']) }]);

    container.resolve(ConversationEventService).start();

    await waitUntil(() => replies.length > 0, { timeoutMs: 2_000 });
    expect(replies).toEqual([once('per_1')]);
});

test('each time the feed opens, answers the requests pending in every project folder and keeps a held one', async () => {
    const { container, replies, feeds, list } = await setup();
    const projectId = await createProject(container, 'Próba');
    await createProject(container, 'Alfa');
    await createFile(container, 'Próba', 'hello.md');
    await save(container, projectId, 'hello.md');
    const pending: Record<string, OpencodePermissionRequest[]> = {
        '/Piko/projects/Próba': [edit('per_1', ['hello.md']), edit('per_2', ['other.md'])],
        '/Piko/projects/Alfa': [edit('per_3', ['/Piko/projects/Alfa/a.md'], 'ses_alfa')],
    };
    list.mockImplementation(directory => Promise.resolve(pending[directory] ?? []));
    // Open, drop, open again: the held request is still pending both times.
    feeds.push([new Error('connection reset')], []);

    container.resolve(ConversationEventService).start();

    await waitUntil(() => list.mock.calls.length === 4, { timeoutMs: 2_000 });
    const listed = list.mock.calls.map(([directory]) => directory).toSorted();
    expect(listed).toEqual([
        '/Piko/projects/Alfa',
        '/Piko/projects/Alfa',
        '/Piko/projects/Próba',
        '/Piko/projects/Próba',
    ]);
    // Each open answers the free ones (again the second time: OpenCode says if one is gone); `per_1` stays held.
    await waitUntil(() => replies.length === 4, { timeoutMs: 2_000 });
    expect(replies.map(params => params.permissionId).toSorted()).toEqual(['per_2', 'per_2', 'per_3', 'per_3']);
});

test('a held request no longer pending when the feed opens again is dropped, unanswered', async () => {
    const { container, replies, feeds, list, fileEvents } = await setup();
    const projectId = await createProject(container, 'Próba');
    await createFile(container, 'Próba', 'hello.md');
    await save(container, projectId, 'hello.md');
    feeds.push([{ type: 'permissionAsked', ...edit('per_1', ['hello.md']) }, new Error('connection reset')], []);

    container.resolve(ConversationEventService).start();

    await waitUntil(() => fileEvents.length === 2, { timeoutMs: 2_000 });
    expect(fileEvents.map(event => event.state)).toEqual(['waiting', null]);
    expect(list).toHaveBeenCalledTimes(2);
    expect(replies).toEqual([]);
});

/** A timer of the fake clock. */
interface FakeTimer {
    at: number;
    callback: () => void;
}

/**
 * A container whose agent feed plays `feeds` in turn, one per connection (as in `ConversationEventService.test.ts`),
 * with a fake clock, no pending requests unless `list` says otherwise, and every reply recorded in `replies`.
 */
async function setup() {
    const { container, logs } = createTestContainer();
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'piko-file-holds-'));
    container.set(EnvVariables, { PIKO_DATA_ROOT: path.join(tmp, 'root') });
    const clock = createFakeClock();
    container.set(Clock, clock);
    const state: SandboxState = {
        status: 'ready',
        endpoint: { url: 'http://127.0.0.1:1', username: 'opencode', password: 'pw' },
    };
    container.set(Sandbox, {
        getState: () => state,
        getVerifiedState: () => Promise.resolve(state),
        getStartProgress: () => null,
        stateChanged: createEventEmitter<[state: SandboxState]>().event,
        start: () => Promise.resolve(state.endpoint),
        stop: () => Promise.resolve(),
        exec: () => {
            throw new Error('not used');
        },
        notifySkillsChanged: () => Promise.resolve(),
    });

    const feeds: (OpencodeEvent | Error)[][] = [];
    container.set(OpencodeEventSubscribeCommand, async function* (_signal: AbortSignal): AsyncGenerator<OpencodeEvent> {
        yield { type: 'streamOpened' };
        for (const event of feeds.shift() ?? []) {
            if (event instanceof Error) {
                throw event;
            }
            yield event;
        }
        await Promise.withResolvers<void>().promise;
    });
    container.set(OpencodeSessionGetCommand, id =>
        Promise.resolve<OpencodeSession | null>(
            id === 'ses_unknown'
                ? null
                : {
                      id,
                      directory: id === 'ses_alfa' ? '/Piko/projects/Alfa' : '/Piko/projects/Próba',
                      createdAt: 0,
                      updatedAt: 0,
                  },
        ),
    );
    const list = mock((_directory: string) => Promise.resolve<OpencodePermissionRequest[]>([]));
    container.set(OpencodePermissionListCommand, list);
    const replies: OpencodePermissionReplyCommandParams[] = [];
    const reply = mock((params: OpencodePermissionReplyCommandParams) => {
        replies.push(params);
        return Promise.resolve<'replied' | 'notFound'>('replied');
    });
    container.set(OpencodePermissionReplyCommand, reply);

    const fileEvents: FileAgentChangedEvent[] = [];
    container.resolve(FileAgentStateService).listen(event => fileEvents.push(event));
    return { container, logs, clock, feeds, list, reply, replies, fileEvents };
}

/** A clock whose time moves only by `advance()`, which runs the timers due by then. */
function createFakeClock() {
    let now = 1_700_000_000_000;
    const timers: FakeTimer[] = [];
    const clock: Clock & { advance(ms: number): void } = {
        now: () => now,
        setTimeout(callback, ms) {
            const timer: FakeTimer = { at: now + ms, callback };
            timers.push(timer);
            return () => {
                const index = timers.indexOf(timer);
                if (index !== -1) {
                    timers.splice(index, 1);
                }
            };
        },
        advance(ms) {
            const until = now + ms;
            while (true) {
                const due = timers.filter(timer => timer.at <= until).toSorted((a, b) => a.at - b.at)[0];
                if (!due) {
                    break;
                }
                timers.splice(timers.indexOf(due), 1);
                now = due.at;
                due.callback();
            }
            now = until;
        },
    };
    return clock;
}

function edit(permissionId: string, resources: string[], sessionId = 'ses_1'): OpencodePermissionRequest {
    return { sessionId, permissionId, action: 'edit', resources };
}

function once(permissionId: string, sessionId = 'ses_1'): OpencodePermissionReplyCommandParams {
    return { sessionId, permissionId, decision: 'once' };
}

async function createProject(container: Container, name: string) {
    const created = await container.resolve(ProjectService).create(name);
    assert('created' in created);
    return created.created.id;
}

async function createFile(container: Container, project: string, name: string) {
    const all = await container.resolve(ProjectService).list();
    const dir = all.find(candidate => path.basename(candidate.dir) === project)?.dir;
    assert(dir);
    await writeFile(path.join(dir, name), 'Pierwsza wersja');
}

/** The person saves the file from the app, as its autosave does. */
async function save(container: Container, projectId: string, filePath: string) {
    const files = container.resolve(ProjectFileService);
    const read = await files.read({ projectId, path: filePath });
    assert('text' in read);
    const written = await files.write({
        projectId,
        path: filePath,
        content: `${read.text.content}!`,
        version: read.text.version,
    });
    assert('written' in written);
}
