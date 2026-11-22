import { expect, test } from 'bun:test';

import type { Schedule, ScheduleUpdateInput } from '@piko/common/api/ScheduleTypes.js';

import { buildScheduleUpdate } from './buildScheduleUpdate.js';
import { describeSchedulePreset } from './schedulePreset.js';

// The tests run with TZ=UTC: local times are UTC.
/** Sunday 22 November 2026, 10:00. */
const NOW = new Date(2026, 10, 22, 10, 0);

const SCHEDULE: Schedule = {
    id: 's1',
    projectId: 'p1',
    projectName: 'Mail',
    name: 'Sort my mail',
    // The agent's own words, which no preset would write.
    when: 'Every morning before work',
    rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0',
    start: '2026-11-01T08:00',
    prompt: 'Sort the inbox.',
    paused: false,
};

test('a new name or prompt goes out alone: the agent’s words for when stay', () => {
    const input = buildScheduleUpdate({
        schedule: SCHEDULE,
        edit: { name: 'Sort the mail', prompt: 'Sort the inbox.', preset: { repeat: 'daily', time: '08:00' } },
        now: NOW,
        language: 'en',
    });

    const expected: ScheduleUpdateInput = { projectId: 'p1', scheduleId: 's1', name: 'Sort the mail' };
    expect(input).toEqual(expected);
});

test('a changed recurrence sends its rule, its anchor and when in the app’s language', () => {
    const input = buildScheduleUpdate({
        schedule: SCHEDULE,
        edit: { name: 'Sort my mail', prompt: 'Sort the inbox and reply.', preset: { repeat: 'daily', time: '09:30' } },
        now: NOW,
        language: 'en',
    });

    const expected: ScheduleUpdateInput = {
        projectId: 'p1',
        scheduleId: 's1',
        prompt: 'Sort the inbox and reply.',
        rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=30',
        start: '2026-11-22T09:30',
        // The compiler glues short words to the next with a no-break space: compare with the same words.
        when: describeSchedulePreset({ repeat: 'daily', time: '09:30' }, 'en'),
    };
    expect(input).toEqual(expected);
});

test('a rule the form shows read-only is never written', () => {
    const input = buildScheduleUpdate({
        schedule: { ...SCHEDULE, rrule: 'FREQ=DAILY;INTERVAL=2;BYHOUR=8;BYMINUTE=0' },
        edit: { name: 'Sort my mail', prompt: 'Sort the inbox.' },
        now: NOW,
        language: 'en',
    });

    expect(input).toBeNull();
});
