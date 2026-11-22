import { afterAll, expect, test } from 'bun:test';

import type { Resolved } from '@nzyme/ioc/Injectable.js';
import { createTestLogger } from '@nzyme/logging/createTestLogger.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';

import type { Conversation } from '@piko/common/api/ConversationTypes.js';
import type { DaemonEvent } from '@piko/common/api/DaemonEventTypes.js';

import { DaemonClient } from '@/daemon/DaemonClient.js';
import type { DaemonEventStreamShape } from '@/daemon/DaemonEventStream.js';

import { ConversationStore } from './ConversationStore.js';
import type { ConversationOrigin } from './ConversationStore.js';

/** The fake daemon's answers, by endpoint name; each test uses its own project, so they never collide. */
const answers = new Map<string, (input: { projectId: string }) => Promise<unknown>>();
const server = Bun.serve({
    port: 0,
    async fetch(request) {
        const name = new URL(request.url).pathname.replace('/api/', '');
        const input: { projectId: string } = await request.json();
        const answer = answers.get(`${name} ${input.projectId}`);
        return answer ? Response.json(await answer(input)) : new Response(null, { status: 404 });
    },
});

afterAll(() => server.stop(true));

test('a conversation an event announces is of unknown origin until a list loaded after it says it is a run', async () => {
    const { store, emit, lists } = setup('p-run');
    lists.push([]);
    store.open('p-run');
    await waitFor(() => store.state.conversations !== null);

    emit({ type: 'conversationCreated', projectId: 'p-run', conversationId: 'c1' });
    expect(originOf(store, 'c1')).toBe<ConversationOrigin>('unknown');

    lists.push([conversation('c1', 's1')]);
    emit({ type: 'schedulesChanged', projectId: 'p-run' });
    await waitFor(() => store.find('c1')?.scheduleId !== undefined);

    expect(originOf(store, 'c1')).toBe<ConversationOrigin>('run');
});

test('a list asked for before the event does not settle the conversation it announces', async () => {
    const { store, emit, lists } = setup('p-early');
    const early = Promise.withResolvers<Conversation[]>();
    lists.push(early.promise);
    store.open('p-early');

    emit({ type: 'conversationCreated', projectId: 'p-early', conversationId: 'c1' });
    early.resolve([conversation('c1')]);
    await waitFor(() => store.state.conversations?.length === 1 && store.find('c1')?.updatedAt === 1);

    expect(originOf(store, 'c1')).toBe<ConversationOrigin>('unknown');
});

test('a conversation this app creates is the person’s, also when its event comes before the answer', async () => {
    const { store, emit, lists, creates } = setup('p-own');
    lists.push([]);
    store.open('p-own');
    await waitFor(() => store.state.conversations !== null);
    const created = Promise.withResolvers<Conversation>();
    creates.push(created.promise);

    const creating = store.create('p-own');
    emit({ type: 'conversationCreated', projectId: 'p-own', conversationId: 'c1' });
    expect(originOf(store, 'c1')).toBe<ConversationOrigin>('unknown');
    created.resolve(conversation('c1'));
    await creating;

    expect(originOf(store, 'c1')).toBe<ConversationOrigin>('person');
});

/** A store over the fake daemon, which answers the project's list and create calls from the queues, in order. */
function setup(projectId: string) {
    const lists: (Conversation[] | Promise<Conversation[]>)[] = [];
    const creates: Promise<Conversation>[] = [];
    answers.set(`conversations/list ${projectId}`, async () => await lists.shift());
    answers.set(`conversations/create ${projectId}`, async () => await creates.shift());
    const emitter = createEventEmitter<[event: DaemonEvent]>();
    const events: DaemonEventStreamShape = { event: emitter.event, start() {} };
    const store = ConversationStore.create({
        daemon: DaemonClient.create({ daemonUrl: server.url.origin }),
        events,
        logger: createTestLogger('ConversationStore').logger,
    });
    return { store, emit: emitter.emit, lists, creates };
}

function originOf(store: Resolved<typeof ConversationStore>, id: string) {
    const found = store.find(id);
    expect(found).toBeDefined();
    return store.originOf(found!);
}

function conversation(id: string, scheduleId?: string): Conversation {
    return { id, updatedAt: 1, running: false, scheduleId };
}

async function waitFor(condition: () => boolean) {
    for (let i = 0; i < 100 && !condition(); i++) {
        await Bun.sleep(5);
    }
    expect(condition()).toBe(true);
}
