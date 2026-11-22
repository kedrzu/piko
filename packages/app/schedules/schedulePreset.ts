import type { Language } from '@nzyme/i18n/Language.js';
import { translateToString } from '@nzyme/i18n/translateToString.js';
import { assertNever } from '@nzyme/utils/assertNever.js';

import * as l from './schedulePreset.loc.js';

/** A day of the week as RRULE writes it. */
export type ScheduleWeekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

/**
 * A recurrence the app's form can set up. Any other rule a schedule may hold (written by the agent) has no preset and
 * is shown as it is, never overwritten by one.
 */
export type SchedulePreset =
    | { repeat: 'daily' | 'weekdays'; time: string }
    | { repeat: 'weekly'; weekday: ScheduleWeekday; time: string }
    | {
          repeat: 'monthly';
          /** 1–28, so that it occurs every month. */
          monthDay: number;
          time: string;
      };

/** The rule of a schedule: its RRULE and the local `YYYY-MM-DDTHH:MM` anchoring it, as `Schedule` holds them. */
export interface ScheduleRule {
    rrule: string;
    start: string;
}

/** Every weekday in the order of `Date.getDay()`. */
const WEEKDAYS: readonly ScheduleWeekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const WORKDAYS = 'MO,TU,WE,TH,FR';
const START_FORMAT = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})$/;
/** A preset's time, `HH:MM`. */
const TIME_FORMAT = /^(\d{2}):(\d{2})$/;
/** The RRULE parts a preset's rule may carry; any other part makes the rule one no preset describes. */
const PRESET_PARTS = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYHOUR', 'BYMINUTE', 'BYSECOND', 'WKST']);
const MAX_MONTH_DAY = 28;
/** How far back `start` is looked for: a monthly preset's day comes round within two months. */
const MAX_DAYS_BACK = 62;

/**
 * The preset a schedule's rule is, or `null` for a rule no preset describes (the form then shows it read-only). Rules
 * equal to a preset's in meaning are recognised: parts in any order, `BYDAY` days in any order, `INTERVAL=1`,
 * `BYSECOND=0`, any `WKST`, the time taken from `start` when `BYHOUR`/`BYMINUTE` are absent, `FREQ=DAILY` limited to
 * one weekday or to Monday–Friday.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseSchedulePreset(rule: ScheduleRule): SchedulePreset | null {
    const start = START_FORMAT.exec(rule.start);
    const parts = parseRrule(rule.rrule);
    if (start === null || parts === null) {
        return null;
    }
    for (const key of parts.keys()) {
        if (!PRESET_PARTS.has(key)) {
            return null;
        }
    }
    const interval = parts.get('INTERVAL');
    const second = parts.get('BYSECOND');
    if (
        (interval !== undefined && parseNumber(interval) !== 1) ||
        (second !== undefined && parseNumber(second) !== 0)
    ) {
        return null;
    }
    const hour = parseNumber(parts.get('BYHOUR') ?? start[1]);
    const minute = parseNumber(parts.get('BYMINUTE') ?? start[2]);
    if (hour === null || hour > 23 || minute === null || minute > 59) {
        return null;
    }
    const time = formatTime(hour, minute);
    const byDay = parts.get('BYDAY');
    const byMonthDay = parts.get('BYMONTHDAY');

    switch (parts.get('FREQ')) {
        case 'DAILY':
            if (byMonthDay !== undefined) {
                return null;
            }
            return byDay === undefined ? { repeat: 'daily', time } : parseWeekdays(byDay, time);
        case 'WEEKLY':
            if (byMonthDay !== undefined || byDay === undefined) {
                return null;
            }
            return parseWeekdays(byDay, time);
        case 'MONTHLY': {
            const monthDay = byMonthDay === undefined ? null : parseNumber(byMonthDay);
            if (byDay !== undefined || monthDay === null || monthDay < 1 || monthDay > MAX_MONTH_DAY) {
                return null;
            }
            return { repeat: 'monthly', monthDay, time };
        }
        default:
            return null;
    }
}

/**
 * The rule a preset saves. `start` is the latest occurrence of the preset at or before `now`, in the computer's time
 * zone: RFC 5545 counts DTSTART as an occurrence even where it does not match the rule, so an anchor outside the
 * pattern could fire once on a day the person never chose. Being past, it fires nothing itself: the daemon counts a
 * changed rule's terms from the moment it sees the change.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function buildSchedulePreset(preset: SchedulePreset, now: Date): ScheduleRule {
    const time = TIME_FORMAT.exec(preset.time);
    const hour = parseNumber(time?.[1]);
    const minute = parseNumber(time?.[2]);
    if (hour === null || hour > 23 || minute === null || minute > 59) {
        throw new Error(`Invalid schedule time "${preset.time}".`);
    }
    const at = `BYHOUR=${hour};BYMINUTE=${minute}`;
    let rrule: string;
    switch (preset.repeat) {
        case 'daily':
            rrule = `FREQ=DAILY;${at}`;
            break;
        case 'weekdays':
            rrule = `FREQ=WEEKLY;BYDAY=${WORKDAYS};${at}`;
            break;
        case 'weekly':
            rrule = `FREQ=WEEKLY;BYDAY=${preset.weekday};${at}`;
            break;
        case 'monthly':
            rrule = `FREQ=MONTHLY;BYMONTHDAY=${preset.monthDay};${at}`;
            break;
        default:
            assertNever(preset);
    }

    for (let daysBack = 0; daysBack <= MAX_DAYS_BACK; daysBack++) {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack, hour, minute);
        if (day.getTime() <= now.getTime() && isPresetDay(preset, day)) {
            return { rrule, start: formatStart(day) };
        }
    }
    throw new Error(`No day of the schedule's preset in the last ${MAX_DAYS_BACK} days.`);
}

/**
 * Whether two presets are the same recurrence: a form saves the rule only when the person changed it, so the agent's
 * own words for `when` stay.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function isSameSchedulePreset(a: SchedulePreset, b: SchedulePreset) {
    if (a.repeat !== b.repeat || a.time !== b.time) {
        return false;
    }
    switch (a.repeat) {
        case 'weekly':
            return b.repeat === 'weekly' && a.weekday === b.weekday;
        case 'monthly':
            return b.repeat === 'monthly' && a.monthDay === b.monthDay;
        case 'daily':
        case 'weekdays':
            return true;
        default:
            return assertNever(a);
    }
}

/**
 * The preset in words, for a schedule's `when`: "Every day at 8:00", "Every month on the 3rd at 8:00".
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function describeSchedulePreset(preset: SchedulePreset, language: Language) {
    const time = preset.time.replace(/^0(\d)/, '$1');
    switch (preset.repeat) {
        case 'daily':
            return translateToString(l.daily, language, { time });
        case 'weekdays':
            return translateToString(l.weekdays, language, { time });
        case 'weekly':
            return translateToString(l[`weekly${preset.weekday}`], language, { time });
        case 'monthly':
            return translateToString(l.monthly, language, { day: formatOrdinal(preset.monthDay, language), time });
        default:
            return assertNever(preset);
    }
}

/** A `BYDAY` of one weekday or of Monday–Friday in any order as a preset; `null` for any other days. */
function parseWeekdays(byDay: string, time: string): SchedulePreset | null {
    const weekday = WEEKDAYS.find(day => day === byDay);
    if (weekday !== undefined) {
        return { repeat: 'weekly', weekday, time };
    }
    return sortDays(byDay) === sortDays(WORKDAYS) ? { repeat: 'weekdays', time } : null;
}

function sortDays(days: string) {
    return days.split(',').toSorted().join(',');
}

/** The RRULE's parts by name, upper-cased; `null` when a part is malformed or repeated. */
function parseRrule(rrule: string) {
    const parts = new Map<string, string>();
    for (const part of rrule.trim().toUpperCase().split(';')) {
        const [key, value, ...rest] = part.split('=');
        if (!key || !value || rest.length > 0 || parts.has(key)) {
            return null;
        }
        parts.set(key, value);
    }
    return parts;
}

/** A plain non-negative integer: no sign, no list. */
function parseNumber(value: string | undefined) {
    return value !== undefined && /^\d{1,2}$/.test(value) ? Number(value) : null;
}

function isPresetDay(preset: SchedulePreset, day: Date) {
    switch (preset.repeat) {
        case 'daily':
            return true;
        case 'weekdays':
            return day.getDay() >= 1 && day.getDay() <= 5;
        case 'weekly':
            return WEEKDAYS[day.getDay()] === preset.weekday;
        case 'monthly':
            return day.getDate() === preset.monthDay;
        default:
            return assertNever(preset);
    }
}

function formatTime(hour: number, minute: number) {
    return `${pad(hour)}:${pad(minute)}`;
}

function formatStart(day: Date) {
    const date = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    return `${date}T${formatTime(day.getHours(), day.getMinutes())}`;
}

function pad(value: number) {
    return String(value).padStart(2, '0');
}

function formatOrdinal(day: number, language: Language) {
    switch (new Intl.PluralRules(language, { type: 'ordinal' }).select(day)) {
        case 'one':
            return translateToString(l.ordinalOne, language, { day });
        case 'two':
            return translateToString(l.ordinalTwo, language, { day });
        case 'few':
            return translateToString(l.ordinalFew, language, { day });
        default:
            return translateToString(l.ordinalOther, language, { day });
    }
}
