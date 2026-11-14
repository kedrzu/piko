import { expect, test } from 'bun:test';

import { parseScheduleDefinition } from './parseScheduleDefinition.js';
import type { ParseScheduleDefinitionResult } from './parseScheduleDefinition.js';

const VALID = {
    name: 'Weekly report',
    when: 'co trzy tygodnie w czwartek o 7',
    rrule: 'FREQ=WEEKLY;INTERVAL=3;BYDAY=TH;BYHOUR=7;BYMINUTE=0',
    start: '2026-11-19T07:00',
    prompt: 'Write the report.',
};

test('accepts a valid file, trims its text and ignores unknown keys', () => {
    const result = parseScheduleDefinition({
        ...VALID,
        name: '  Weekly report ',
        rrule: ' FREQ=DAILY ',
        paused: true,
        extra: 1,
    });

    const expected: ParseScheduleDefinitionResult = {
        definition: { ...VALID, name: 'Weekly report', rrule: 'FREQ=DAILY', paused: true },
    };
    expect(result).toEqual(expected);
});

test.each([
    ['MINUTELY', 'FREQ=MINUTELY'],
    ['SECONDLY', 'FREQ=SECONDLY;INTERVAL=30'],
])('rejects FREQ=%s', (freq, rrule) => {
    const result = parseScheduleDefinition({ ...VALID, rrule });

    const expected: ParseScheduleDefinitionResult = {
        error: `"rrule": FREQ=${freq} is not allowed; the most frequent is HOURLY.`,
    };
    expect(result).toEqual(expected);
});

test.each([
    ['null', null, 'A schedule file'],
    ['an array', [VALID], 'A schedule file'],
    ['a string', 'FREQ=DAILY', 'A schedule file'],
    ['a missing name', { ...VALID, name: undefined }, '"name"'],
    ['a blank prompt', { ...VALID, prompt: '   ' }, '"prompt"'],
    ['a non-string when', { ...VALID, when: 7 }, '"when"'],
    ['a missing rrule', { ...VALID, rrule: undefined }, '"rrule"'],
    ['a start with a space', { ...VALID, start: '2026-11-19 07:00' }, '"start"'],
    ['a start with seconds', { ...VALID, start: '2026-11-19T07:00:00' }, '"start"'],
    ['a start on a nonexistent day', { ...VALID, start: '2026-02-30T07:00' }, '"start"'],
    ['a start with an offset', { ...VALID, start: '2026-11-19T07:00Z' }, '"start"'],
    ['an unknown FREQ', { ...VALID, rrule: 'FREQ=BOGUS' }, '"rrule"'],
    ['an rrule without FREQ', { ...VALID, rrule: 'BYDAY=MO' }, '"rrule"'],
    ['an RRULE: prefix', { ...VALID, rrule: 'RRULE:FREQ=DAILY' }, '"rrule"'],
    ['a DTSTART', { ...VALID, rrule: 'DTSTART:20260101T090000\nRRULE:FREQ=DAILY' }, '"rrule"'],
    ['a non-boolean paused', { ...VALID, paused: 'yes' }, '"paused"'],
])('rejects %s with an error naming the problem', (_, value, mentions) => {
    const result = parseScheduleDefinition(value);

    expect('error' in result ? result.error : undefined).toContain(mentions);
});
