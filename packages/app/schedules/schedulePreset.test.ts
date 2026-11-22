import { expect, test } from 'bun:test';

import {
    buildSchedulePreset,
    describeSchedulePreset,
    isSameSchedulePreset,
    parseSchedulePreset,
} from './schedulePreset.js';
import type { SchedulePreset, ScheduleRule } from './schedulePreset.js';

// The tests run with TZ=UTC: local times are UTC.
/** Sunday 22 November 2026, 10:00. */
const SUNDAY = new Date(2026, 10, 22, 10, 0);

const PRESETS: SchedulePreset[] = [
    { repeat: 'daily', time: '08:00' },
    { repeat: 'weekdays', time: '07:30' },
    { repeat: 'weekly', weekday: 'MO', time: '09:00' },
    { repeat: 'monthly', monthDay: 3, time: '08:05' },
];

test.each(PRESETS)('a $repeat preset saved and read back is the same preset', preset => {
    expect(parseSchedulePreset(buildSchedulePreset(preset, SUNDAY))).toEqual(preset);
});

test('each preset saves its canonical rule, anchored at its latest occurrence at or before now', () => {
    const rules = PRESETS.map(preset => buildSchedulePreset(preset, SUNDAY));

    const expected: ScheduleRule[] = [
        // 08:00 today has passed.
        { rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0', start: '2026-11-22T08:00' },
        // Never the weekend: Friday.
        { rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=7;BYMINUTE=30', start: '2026-11-20T07:30' },
        // Saved on a Sunday: the Monday before, never the Sunday itself.
        { rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0', start: '2026-11-16T09:00' },
        { rrule: 'FREQ=MONTHLY;BYMONTHDAY=3;BYHOUR=8;BYMINUTE=5', start: '2026-11-03T08:05' },
    ];
    expect(rules).toEqual(expected);
});

test('a time later today anchors the rule at the day before, never in the future', () => {
    const daily = buildSchedulePreset({ repeat: 'daily', time: '10:01' }, SUNDAY);
    const monthly = buildSchedulePreset({ repeat: 'monthly', monthDay: 22, time: '10:01' }, SUNDAY);

    expect(daily.start).toBe('2026-11-21T10:01');
    expect(monthly.start).toBe('2026-10-22T10:01');
});

test.each<[string, ScheduleRule, SchedulePreset]>([
    [
        'parts in another order, with INTERVAL=1, BYSECOND=0 and WKST',
        {
            rrule: 'BYMINUTE=30;WKST=SU;BYHOUR=7;BYSECOND=0;INTERVAL=1;FREQ=WEEKLY;BYDAY=FR,TH,WE,TU,MO',
            start: '2026-11-20T07:30',
        },
        { repeat: 'weekdays', time: '07:30' },
    ],
    [
        'the time taken from start',
        { rrule: 'FREQ=DAILY', start: '2026-11-01T06:45' },
        { repeat: 'daily', time: '06:45' },
    ],
    [
        'lower case',
        { rrule: 'freq=weekly;byday=th', start: '2026-11-19T07:00' },
        { repeat: 'weekly', weekday: 'TH', time: '07:00' },
    ],
    [
        'a daily rule limited to Monday–Friday',
        { rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=8;BYMINUTE=0', start: '2026-11-20T08:00' },
        { repeat: 'weekdays', time: '08:00' },
    ],
    [
        'a monthly rule with only the hour',
        { rrule: 'FREQ=MONTHLY;BYMONTHDAY=28;BYHOUR=18', start: '2026-10-28T18:15' },
        { repeat: 'monthly', monthDay: 28, time: '18:15' },
    ],
])('recognises an equivalent rule: %s', (_, rule, expected) => {
    expect(parseSchedulePreset(rule)).toEqual(expected);
});

test.each([
    ['INTERVAL>1', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;BYHOUR=9;BYMINUTE=0'],
    ['several hours', 'FREQ=DAILY;BYHOUR=8,17;BYMINUTE=0'],
    ['several minutes', 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0,30'],
    ['BYSECOND other than 0', 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=30'],
    ['COUNT', 'FREQ=DAILY;COUNT=5;BYHOUR=8;BYMINUTE=0'],
    ['UNTIL', 'FREQ=DAILY;UNTIL=20271231T000000Z;BYHOUR=8;BYMINUTE=0'],
    ['BYSETPOS', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;BYHOUR=8;BYMINUTE=0'],
    ['BYMONTH', 'FREQ=MONTHLY;BYMONTH=1;BYMONTHDAY=3;BYHOUR=8;BYMINUTE=0'],
    ['a month day above 28', 'FREQ=MONTHLY;BYMONTHDAY=31;BYHOUR=8;BYMINUTE=0'],
    ['a negative month day', 'FREQ=MONTHLY;BYMONTHDAY=-1;BYHOUR=8;BYMINUTE=0'],
    ['several month days', 'FREQ=MONTHLY;BYMONTHDAY=1,15;BYHOUR=8;BYMINUTE=0'],
    ['a monthly rule without a month day', 'FREQ=MONTHLY;BYHOUR=8;BYMINUTE=0'],
    ['a monthly rule on a weekday', 'FREQ=MONTHLY;BYDAY=3TH;BYHOUR=8;BYMINUTE=0'],
    ['several days other than Monday–Friday', 'FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=8;BYMINUTE=0'],
    ['Monday–Friday with a day repeated', 'FREQ=WEEKLY;BYDAY=MO,MO,TU,WE,TH,FR;BYHOUR=8;BYMINUTE=0'],
    ['a weekly rule with no BYDAY', 'FREQ=WEEKLY;BYHOUR=8;BYMINUTE=0'],
    ['an hourly rule', 'FREQ=HOURLY;BYMINUTE=0'],
    ['an hour out of range', 'FREQ=DAILY;BYHOUR=24;BYMINUTE=0'],
    ['a part repeated', 'FREQ=DAILY;BYHOUR=8;BYHOUR=9;BYMINUTE=0'],
    ['a malformed part', 'FREQ=DAILY;BYHOUR'],
])('a rule with %s has no preset', (_, rrule) => {
    expect(parseSchedulePreset({ rrule, start: '2026-11-03T08:00' })).toBeNull();
});

test('a start that is not a local date-time has no preset', () => {
    expect(parseSchedulePreset({ rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0', start: '2026-11-03' })).toBeNull();
});

test('presets differing only in the weekday or the month day are not the same', () => {
    expect(
        isSameSchedulePreset(
            { repeat: 'weekly', weekday: 'MO', time: '09:00' },
            { repeat: 'weekly', weekday: 'MO', time: '09:00' },
        ),
    ).toBe(true);
    expect(
        isSameSchedulePreset(
            { repeat: 'weekly', weekday: 'MO', time: '09:00' },
            { repeat: 'weekly', weekday: 'TU', time: '09:00' },
        ),
    ).toBe(false);
    expect(
        isSameSchedulePreset(
            { repeat: 'monthly', monthDay: 3, time: '08:00' },
            { repeat: 'monthly', monthDay: 4, time: '08:00' },
        ),
    ).toBe(false);
});

test('a month day reads as an ordinal in English and Polish', () => {
    const descriptions = [1, 2, 3, 11, 22].map(monthDay =>
        describeInWords({ repeat: 'monthly', monthDay, time: '08:00' }, 'en'),
    );

    expect(descriptions).toEqual([
        'Every month on the 1st at 8:00',
        'Every month on the 2nd at 8:00',
        'Every month on the 3rd at 8:00',
        'Every month on the 11th at 8:00',
        'Every month on the 22nd at 8:00',
    ]);
    expect(describeInWords({ repeat: 'monthly', monthDay: 3, time: '08:00' }, 'pl')).toBe(
        'Co miesiąc, 3. dnia, o 8:00',
    );
});

/** The description with the no-break spaces the compiler glues short words with read as spaces. */
function describeInWords(preset: SchedulePreset, language: 'en' | 'pl') {
    return describeSchedulePreset(preset, language).replaceAll('\u00A0', ' ');
}
