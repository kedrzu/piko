import { expect, test } from 'bun:test';

import { formatScheduleMoment } from './formatScheduleMoment.js';
import type { ScheduleMoment } from './formatScheduleMoment.js';

// The tests run with TZ=UTC: local times are UTC.
/** Sunday 22 November 2026, 10:00. */
const NOW = new Date(2026, 10, 22, 10, 0).getTime();

test('a moment on today, yesterday or tomorrow is named by its day, whatever the hour', () => {
    const moments = [new Date(2026, 10, 22, 0, 5), new Date(2026, 10, 21, 23, 59), new Date(2026, 10, 23, 8, 0)].map(
        at => formatScheduleMoment({ at: at.getTime(), now: NOW, language: 'en' }),
    );

    const expected: ScheduleMoment[] = [
        { day: 'Today', time: '0:05', dayAndTime: 'today 0:05' },
        { day: 'Yesterday', time: '23:59', dayAndTime: 'yesterday 23:59' },
        { day: 'Tomorrow', time: '8:00', dayAndTime: 'tomorrow 8:00' },
    ];
    expect(moments).toEqual(expected);
});

test('a moment further away is its date, with the year only when it is another year’s', () => {
    const moments = [new Date(2026, 10, 20, 8, 0), new Date(2025, 11, 31, 8, 0)].map(at =>
        formatScheduleMoment({ at: at.getTime(), now: NOW, language: 'en' }),
    );

    const expected: ScheduleMoment[] = [
        { day: 'Fri 20 Nov', time: '8:00', dayAndTime: 'Fri 20 Nov, 8:00' },
        { day: 'Wed 31 Dec 2025', time: '8:00', dayAndTime: 'Wed 31 Dec 2025, 8:00' },
    ];
    expect(moments).toEqual(expected);
});

test('the day is said in the app’s language', () => {
    const moment = formatScheduleMoment({ at: new Date(2026, 10, 23, 8, 0).getTime(), now: NOW, language: 'pl' });

    expect(moment.dayAndTime).toBe('jutro 8:00');
});
