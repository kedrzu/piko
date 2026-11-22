import type { Language } from '@nzyme/i18n/Language.js';
import { translateToString } from '@nzyme/i18n/translateToString.js';

import * as l from './formatScheduleMoment.loc.js';

/** What `formatScheduleMoment` needs. */
export interface FormatScheduleMomentParams {
    /** Epoch ms of the moment. */
    at: number;
    /** Epoch ms of now. */
    now: number;
    language: Language;
}

/** A moment as a schedule's screens say it, in the computer's time zone. */
export interface ScheduleMoment {
    /** The day alone: "Today", "Yesterday", "Tomorrow", else "Fri 20 Nov" (with the year when it is another year's). */
    day: string;
    /** The time, `H:MM` on a 24-hour clock, as `when` says it: "8:00". */
    time: string;
    /** The day and the time inside a sentence: "today 8:00", "tomorrow 8:00", "Fri 20 Nov, 8:00". */
    dayAndTime: string;
}

/**
 * A moment of a schedule (a run, its term, the next term) as a person says it, relative to today.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function formatScheduleMoment({ at, now, language }: FormatScheduleMomentParams): ScheduleMoment {
    const when = new Date(at);
    const today = new Date(now);
    const time = `${when.getHours()}:${String(when.getMinutes()).padStart(2, '0')}`;
    switch (calendarDaysBetween(today, when)) {
        case 0:
            return {
                day: translateToString(l.today, language),
                time,
                dayAndTime: translateToString(l.todayAt, language, { time }),
            };
        case -1:
            return {
                day: translateToString(l.yesterday, language),
                time,
                dayAndTime: translateToString(l.yesterdayAt, language, { time }),
            };
        case 1:
            return {
                day: translateToString(l.tomorrow, language),
                time,
                dayAndTime: translateToString(l.tomorrowAt, language, { time }),
            };
        default: {
            const date = formatDate(when, today, language);
            return { day: date, time, dayAndTime: translateToString(l.dateAt, language, { date, time }) };
        }
    }
}

/** "Fri 20 Nov" in the language's words, in this order whatever the language's own; the year only when not this one. */
function formatDate(when: Date, today: Date, language: Language) {
    const parts = new Intl.DateTimeFormat(language, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: when.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    }).formatToParts(when);
    const order: Intl.DateTimeFormatPartTypes[] = ['weekday', 'day', 'month', 'year'];
    return order
        .map(type => parts.find(part => part.type === type)?.value)
        .filter(value => value !== undefined)
        .join(' ');
}

/** How many midnights lie from one time to another, in the local time zone; negative when `to` is earlier. */
function calendarDaysBetween(from: Date, to: Date) {
    const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((end - start) / 86_400_000);
}
