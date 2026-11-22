import { expect, test } from 'bun:test';

import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { ScheduleRun } from '@piko/common/api/ScheduleTypes.js';

import * as l from './describeRunTiming.loc.js';
import { describeRunTiming } from './describeRunTiming.js';

// The tests run with TZ=UTC: local times are UTC.
/** Sunday 22 November 2026, 10:00. */
const NOW = new Date(2026, 10, 22, 10, 0).getTime();
const TERM = new Date(2026, 10, 21, 23, 0).getTime();

test('on its own, the term says its day and the start its own only when it differs; late says why', () => {
    const onTime = describeRunTiming({ run: run(TERM + 60_000), now: NOW, language: 'en', standalone: true });
    const late = describeRunTiming({
        run: run(new Date(2026, 10, 22, 9, 13).getTime()),
        now: NOW,
        language: 'en',
        standalone: true,
    });

    expect([onTime, late]).toEqual([
        translateToString(l.onTime, 'en', { due: 'yesterday 23:00', time: '23:01' }),
        translateToString(l.late, 'en', { due: 'yesterday 23:00', time: 'today 9:13' }),
    ]);
});

test('beside a day column, the start is its time and the term its day only when it differs', () => {
    const late = describeRunTiming({ run: run(new Date(2026, 10, 22, 9, 13).getTime()), now: NOW, language: 'en' });

    expect(late).toBe(translateToString(l.late, 'en', { due: 'yesterday 23:00', time: '9:13' }));
});

function run(at: number): ScheduleRun {
    return { term: TERM, at, outcome: 'started', conversationId: 'c1' };
}
