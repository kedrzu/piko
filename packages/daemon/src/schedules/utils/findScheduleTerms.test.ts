import { expect, test } from 'bun:test';

import { findScheduleTerms } from './findScheduleTerms.js';
import type { FindScheduleTermsResult } from './findScheduleTerms.js';
import type { ScheduleDefinition } from './parseScheduleDefinition.js';

const TIME_ZONE = 'Europe/Warsaw';

test('every three weeks on Thursday fires at the start, +21 and +42 days and on no Thursday between', () => {
    const definition = schedule('FREQ=WEEKLY;INTERVAL=3;BYDAY=TH;BYHOUR=7;BYMINUTE=0', '2026-11-19T07:00');

    const beforeStart = findScheduleTerms(definition, { now: warsaw('2026-11-19T06:59'), timeZone: TIME_ZONE });
    const atStart = findScheduleTerms(definition, { now: warsaw('2026-11-19T07:00'), timeZone: TIME_ZONE });

    const expectedBeforeStart: FindScheduleTermsResult = {
        next: [warsaw('2026-11-19T07:00'), warsaw('2026-12-10T07:00'), warsaw('2026-12-31T07:00')],
    };
    const expectedAtStart: FindScheduleTermsResult = {
        latest: warsaw('2026-11-19T07:00'),
        next: [warsaw('2026-12-10T07:00'), warsaw('2026-12-31T07:00'), warsaw('2027-01-21T07:00')],
    };
    expect(beforeStart).toEqual(expectedBeforeStart);
    expect(atStart).toEqual(expectedAtStart);
});

test('monthly on 3TH falls on the third Thursday', () => {
    const definition = schedule('FREQ=MONTHLY;BYDAY=3TH', '2026-11-01T09:00');

    const result = findScheduleTerms(definition, { now: warsaw('2026-11-14T12:00'), timeZone: TIME_ZONE });

    const expected: FindScheduleTermsResult = {
        next: [warsaw('2026-11-19T09:00'), warsaw('2026-12-17T09:00'), warsaw('2027-01-21T09:00')],
    };
    expect(result).toEqual(expected);
});

test('the first of the month unless it is a Monday skips June 2026', () => {
    const definition = schedule('FREQ=MONTHLY;BYMONTHDAY=1;BYDAY=TU,WE,TH,FR,SA,SU', '2026-04-01T09:00');

    const result = findScheduleTerms(definition, { now: warsaw('2026-04-15T12:00'), timeZone: TIME_ZONE });

    const expected: FindScheduleTermsResult = {
        latest: warsaw('2026-04-01T09:00'),
        next: [warsaw('2026-05-01T09:00'), warsaw('2026-07-01T09:00'), warsaw('2026-08-01T09:00')],
    };
    expect(result).toEqual(expected);
});

test('the latest term is the last one at or before now, and next ones are strictly after it', () => {
    const definition = schedule('FREQ=DAILY;BYHOUR=9;BYMINUTE=0', '2026-11-01T09:00');

    const justBefore = findScheduleTerms(definition, {
        now: warsaw('2026-11-14T08:59'),
        timeZone: TIME_ZONE,
        count: 2,
    });
    const exactly = findScheduleTerms(definition, { now: warsaw('2026-11-14T09:00'), timeZone: TIME_ZONE, count: 2 });

    const expectedJustBefore: FindScheduleTermsResult = {
        latest: warsaw('2026-11-13T09:00'),
        next: [warsaw('2026-11-14T09:00'), warsaw('2026-11-15T09:00')],
    };
    const expectedExactly: FindScheduleTermsResult = {
        latest: warsaw('2026-11-14T09:00'),
        next: [warsaw('2026-11-15T09:00'), warsaw('2026-11-16T09:00')],
    };
    expect(justBefore).toEqual(expectedJustBefore);
    expect(exactly).toEqual(expectedExactly);
});

test('a rule exhausted by COUNT keeps its last term as latest and has no next terms', () => {
    const definition = schedule('FREQ=DAILY;COUNT=3', '2026-11-01T09:00');

    const result = findScheduleTerms(definition, { now: warsaw('2026-11-14T12:00'), timeZone: TIME_ZONE });

    const expected: FindScheduleTermsResult = { latest: warsaw('2026-11-03T09:00'), next: [] };
    expect(result).toEqual(expected);
});

test('a rule exhausted by UNTIL keeps its last term as latest and has no next terms', () => {
    // 08:00 UTC is 09:00 in Warsaw in November.
    const definition = schedule('FREQ=DAILY;UNTIL=20261105T080000Z', '2026-11-01T09:00');

    const result = findScheduleTerms(definition, { now: warsaw('2026-11-14T12:00'), timeZone: TIME_ZONE });

    const expected: FindScheduleTermsResult = { latest: warsaw('2026-11-05T09:00'), next: [] };
    expect(result).toEqual(expected);
});

// The rules the app's presets save, anchored as `buildSchedulePreset()` in the app anchors them: at the preset's latest
// occurrence before saving, here on Sunday 22 November 2026 at 10:00.
test('the rules the app saves fire only on the days of their preset', () => {
    const now = warsaw('2026-11-22T10:00');
    const weekdays = schedule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=7;BYMINUTE=30', '2026-11-20T07:30');
    const weeklyMonday = schedule('FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0', '2026-11-16T09:00');
    const monthlyThird = schedule('FREQ=MONTHLY;BYMONTHDAY=3;BYHOUR=8;BYMINUTE=0', '2026-11-03T08:00');

    const results = [
        findScheduleTerms(weekdays, { now, timeZone: TIME_ZONE, count: 6 }),
        findScheduleTerms(weeklyMonday, { now, timeZone: TIME_ZONE, count: 1 }),
        findScheduleTerms(monthlyThird, { now, timeZone: TIME_ZONE, count: 2 }),
    ];

    const expected: FindScheduleTermsResult[] = [
        {
            // Friday, then Monday to Friday and Monday again: never Saturday or Sunday.
            latest: warsaw('2026-11-20T07:30'),
            next: [
                warsaw('2026-11-23T07:30'),
                warsaw('2026-11-24T07:30'),
                warsaw('2026-11-25T07:30'),
                warsaw('2026-11-26T07:30'),
                warsaw('2026-11-27T07:30'),
                warsaw('2026-11-30T07:30'),
            ],
        },
        // Saved on a Sunday, it does not fire that Sunday: the anchor is the Monday before.
        { latest: warsaw('2026-11-16T09:00'), next: [warsaw('2026-11-23T09:00')] },
        { latest: warsaw('2026-11-03T08:00'), next: [warsaw('2026-12-03T08:00'), warsaw('2027-01-03T08:00')] },
    ];
    expect(results).toEqual(expected);
});

test.each([
    ['never occurs', 'FREQ=MONTHLY;BYMONTH=2;BYMONTHDAY=31', '2026-01-01T09:00'],
    ['too many occurrences to walk', 'FREQ=HOURLY;COUNT=100000', '2020-01-01T09:00'],
])('a rule that %s gives an error instead of throwing', (_, rrule, start) => {
    const result = findScheduleTerms(schedule(rrule, start), { now: warsaw('2026-11-14T12:00'), timeZone: TIME_ZONE });

    expect('error' in result ? result.error : undefined).toContain('"rrule": its terms cannot be computed');
});

function schedule(rrule: string, start: string): ScheduleDefinition {
    return { name: 'Report', when: 'test', rrule, start, prompt: 'Write the report.' };
}

function warsaw(dateTime: string) {
    return Temporal.PlainDateTime.from(dateTime).toZonedDateTime(TIME_ZONE).epochMilliseconds;
}
