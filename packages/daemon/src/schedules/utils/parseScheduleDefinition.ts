import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { createScheduleRule } from './createScheduleRule.js';

/**
 * The content of a schedule file, `<project>/.schedules/<id>.json`, written by the daemon's API or by the agent.
 */
export interface ScheduleDefinition {
    name: string;
    /** The recurrence described in the person's language; shown to people, never interpreted. */
    when: string;
    /** An RFC 5545 RRULE value without the `RRULE:` prefix and without DTSTART, e.g. `FREQ=WEEKLY;BYDAY=TH`. */
    rrule: string;
    /** The interval anchor: a local date-time `YYYY-MM-DDTHH:MM` in the computer's time zone. */
    start: string;
    /** The first message of the conversation each term starts. */
    prompt: string;
    paused?: boolean;
}

/**
 * The result of {@link parseScheduleDefinition}: the definition, or why the file is not one.
 */
export type ParseScheduleDefinitionResult = { definition: ScheduleDefinition } | { error: string };

const START_FORMAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Validates the parsed JSON of a schedule file. Never throws: anything wrong comes back as an `error` sentence
 * addressed to the agent that wrote the file. The RRULE must be the bare value — an `RRULE:` prefix or a DTSTART is
 * rejected rather than stripped, so a file has one canonical form. Unknown keys are ignored.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseScheduleDefinition(value: unknown): ParseScheduleDefinitionResult {
    if (!isPlainObject(value)) {
        return { error: 'A schedule file must be a JSON object.' };
    }

    const name = readText(value.name);
    if (name == null) {
        return { error: textError('name') };
    }
    const when = readText(value.when);
    if (when == null) {
        return { error: textError('when') };
    }
    const prompt = readText(value.prompt);
    if (prompt == null) {
        return { error: textError('prompt') };
    }

    const start = value.start;
    if (typeof start !== 'string' || !START_FORMAT.test(start) || !isValidPlainDateTime(start)) {
        return { error: '"start" must be a local date-time in the format YYYY-MM-DDTHH:MM, e.g. 2026-11-19T07:00.' };
    }

    const rrule = readText(value.rrule);
    if (rrule == null) {
        return { error: textError('rrule') };
    }
    const rruleError = validateRrule(rrule, start);
    if (rruleError != null) {
        return { error: rruleError };
    }

    const paused = value.paused;
    if (paused !== undefined && typeof paused !== 'boolean') {
        return { error: '"paused" must be true or false.' };
    }

    const definition: ScheduleDefinition = { name, when, rrule, start, prompt };
    if (paused !== undefined) {
        definition.paused = paused;
    }
    return { definition };
}

function readText(value: unknown) {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
}

function textError(field: string) {
    return `"${field}" must be a non-empty string.`;
}

function isValidPlainDateTime(value: string) {
    try {
        Temporal.PlainDateTime.from(value, { overflow: 'reject' });
        return true;
    } catch {
        return false;
    }
}

function validateRrule(rrule: string, start: string) {
    if (/^RRULE:/i.test(rrule)) {
        return '"rrule": write the value without the "RRULE:" prefix, e.g. FREQ=WEEKLY;BYDAY=TH.';
    }
    if (/DTSTART/i.test(rrule) || /[\r\n]/.test(rrule)) {
        return '"rrule": must be a single RRULE value without DTSTART; the anchor goes in "start".';
    }

    let freq: string;
    try {
        // The zone does not change whether the rule parses, so any fixed one will do.
        freq = createScheduleRule({ rrule, start, timeZone: 'UTC' }).options().freq;
    } catch (error) {
        return `"rrule": ${error instanceof Error ? error.message : String(error)}.`;
    }

    switch (freq) {
        case 'MINUTELY':
        case 'SECONDLY':
            return `"rrule": FREQ=${freq} is not allowed; the most frequent is HOURLY.`;
        default:
            return undefined;
    }
}
