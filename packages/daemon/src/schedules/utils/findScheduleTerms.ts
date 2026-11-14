import { createScheduleRule } from './createScheduleRule.js';
import type { ScheduleDefinition } from './parseScheduleDefinition.js';

/**
 * Options of {@link findScheduleTerms}.
 */
export interface FindScheduleTermsOptions {
    /** Epoch milliseconds. */
    now: number;
    /** The time zone `start` is in; the computer's own. */
    timeZone: string;
    /** How many upcoming terms to return; 3 by default. */
    count?: number;
}

/**
 * The terms of a schedule around a moment, as epoch milliseconds.
 */
export interface ScheduleTerms {
    /** The latest term at or before `now`; absent before the first term. */
    latest?: number;
    /** The upcoming terms strictly after `now`, oldest first; shorter or empty once the rule runs out. */
    next: number[];
}

/**
 * The result of {@link findScheduleTerms}: the terms, or why they cannot be computed.
 */
export type FindScheduleTermsResult = ScheduleTerms | { error: string };

const DEFAULT_COUNT = 3;

/**
 * Computes a schedule's latest and upcoming terms from its RRULE anchored at `start`. Daylight-saving changes follow
 * RFC 5545: a time skipped in spring does not occur that day, a time repeated in autumn occurs once.
 *
 * Expects a definition from `parseScheduleDefinition()`. A rule that parses can still be impossible to compute —
 * one that never occurs (`BYMONTH=2;BYMONTHDAY=31`), or a COUNT so large the library gives up — so that comes back
 * as an `error` instead of a throw.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function findScheduleTerms(
    definition: ScheduleDefinition,
    options: FindScheduleTermsOptions,
): FindScheduleTermsResult {
    const rule = createScheduleRule({
        rrule: definition.rrule,
        start: definition.start,
        timeZone: options.timeZone,
    });
    const now = Temporal.Instant.fromEpochMilliseconds(options.now).toZonedDateTimeISO(options.timeZone);
    const count = options.count ?? DEFAULT_COUNT;

    try {
        const terms: ScheduleTerms = { next: [] };
        const latest = rule.previous(now, true);
        if (latest != null) {
            terms.latest = latest.epochMilliseconds;
        }

        let cursor = now;
        while (terms.next.length < count) {
            const term = rule.next(cursor);
            if (term == null) {
                break;
            }
            terms.next.push(term.epochMilliseconds);
            cursor = term;
        }

        return terms;
    } catch (error) {
        return {
            error: `"rrule": its terms cannot be computed: ${error instanceof Error ? error.message : String(error)}.`,
        };
    }
}
