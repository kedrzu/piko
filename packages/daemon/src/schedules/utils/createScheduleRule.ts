import { RRuleTemporal } from 'rrule-temporal';

/**
 * Parameters of {@link createScheduleRule}.
 */
export interface CreateScheduleRuleParams {
    /** An RRULE value without the `RRULE:` prefix and without DTSTART. */
    rrule: string;
    /** The interval anchor as a local date-time, `YYYY-MM-DDTHH:MM`. */
    start: string;
    /** The time zone `start` and every occurrence are in. */
    timeZone: string;
}

/**
 * Builds the recurrence of a schedule: its RRULE anchored at `start` in `timeZone`. Throws when the RRULE or the
 * start does not parse.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function createScheduleRule(params: CreateScheduleRuleParams) {
    return new RRuleTemporal({
        rruleString: params.rrule,
        dtstart: Temporal.PlainDateTime.from(params.start).toZonedDateTime(params.timeZone),
        // Occurrences come back as the runtime's own `Temporal.ZonedDateTime`, not the `temporal-spec` type.
        temporal: Temporal,
    });
}
