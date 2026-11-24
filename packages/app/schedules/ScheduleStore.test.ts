import { afterAll, expect, test } from 'bun:test';

import { createTestLogger } from '@nzyme/logging/createTestLogger.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';

import type { DaemonEvent } from '@piko/common/api/DaemonEventTypes.js';
import type { Schedule, ScheduleRun } from '@piko/common/api/ScheduleTypes.js';

import { DaemonClient } from '@/daemon/DaemonClient.js';
import type { DaemonEventStreamShape } from '@/daemon/DaemonEventStream.js';

import { ScheduleStore } from './ScheduleStore.js';
import type { ScheduleRuns } from './ScheduleStore.js';

/** What the fake daemon answers now. */
let schedules: Schedule[] = [];
const runs = new Map<string, ScheduleRun[]>();
const server = Bun.serve({
    port: 0,
    async fetch(request) {
        const name = new URL(request.url).pathname.replace('/api/', '');
        const input: { scheduleId?: string } = await request.json();
        switch (name) {
            case 'schedules/list':
                return Response.json(schedules);
            case 'schedules/runs':
                return Response.json(runs.get(input.scheduleId ?? '') ?? []);
            default:
                return new Response(null, { status: 404 });
        }
    },
});

afterAll(() => server.stop(true));

test('a project’s schedulesChanged lists the schedules again and reloads that project’s runs only', async () => {
    const emitter = createEventEmitter<[event: DaemonEvent]>();
    const events: DaemonEventStreamShape = { event: emitter.event, start() {} };
    const store = ScheduleStore.create({
        daemon: DaemonClient.create({ daemonUrl: server.url.origin }),
        events,
        logger: createTestLogger('ScheduleStore').logger,
    });
    const a = { projectId: 'pa', scheduleId: 'sa' };
    const b = { projectId: 'pb', scheduleId: 'sb' };
    schedules = [schedule('pa', 'sa')];
    runs.set('sa', [run(1)]);
    runs.set('sb', [run(1)]);
    await store.load();
    store.runsOf(a);
    store.runsOf(b);
    await waitFor(() => store.runsOf(a).runs !== null && store.runsOf(b).runs !== null);

    schedules = [schedule('pa', 'sa'), schedule('pa', 'sa2')];
    runs.set('sa', [run(2), run(1)]);
    runs.set('sb', [run(2), run(1)]);
    emitter.emit({ type: 'schedulesChanged', projectId: 'pa' });
    await waitFor(() => store.state.schedules?.length === 2 && store.runsOf(a).runs?.length === 2);
    await Bun.sleep(20);

    const expectedA: ScheduleRuns = { runs: [run(2), run(1)], error: null };
    const expectedB: ScheduleRuns = { runs: [run(1)], error: null };
    expect(store.runsOf(a)).toEqual(expectedA);
    expect(store.runsOf(b)).toEqual(expectedB);
});

function schedule(projectId: string, id: string): Schedule {
    return {
        id,
        projectId,
        projectName: projectId,
        name: id,
        when: 'Every day at 8:00',
        rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0',
        start: '2026-11-22T08:00',
        prompt: 'Write the report.',
        paused: false,
    };
}

function run(term: number): ScheduleRun {
    return { term, at: term, outcome: 'started', conversationId: `c${term}` };
}

async function waitFor(condition: () => boolean) {
    for (let i = 0; i < 100 && !condition(); i++) {
        await Bun.sleep(5);
    }
    expect(condition()).toBe(true);
}
