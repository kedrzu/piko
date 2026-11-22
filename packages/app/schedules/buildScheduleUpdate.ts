import type { Language } from '@nzyme/i18n/Language.js';

import type { Schedule, ScheduleUpdateInput } from '@piko/common/api/ScheduleTypes.js';

import {
    buildSchedulePreset,
    describeSchedulePreset,
    isSameSchedulePreset,
    parseSchedulePreset,
} from './schedulePreset.js';
import type { SchedulePreset } from './schedulePreset.js';

/** What the person saved in a schedule's form; the recurrence is absent when the form showed the rule read-only. */
export interface ScheduleEdit {
    name: string;
    prompt: string;
    preset?: SchedulePreset;
}

/** What `buildScheduleUpdate` needs. */
export interface BuildScheduleUpdateParams {
    /** The schedule as it is now. */
    schedule: Schedule;
    edit: ScheduleEdit;
    /** Anchors a changed recurrence (`buildSchedulePreset`). */
    now: Date;
    /** The language a changed recurrence's `when` is written in. */
    language: Language;
}

/**
 * The change a schedule's form saves: only the fields the person changed, so a save never overwrites what she left
 * alone. `when`, `rrule` and `start` go out only when she changed the recurrence: the agent's own words for `when`
 * survive a new name or prompt. `null` when nothing changed.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function buildScheduleUpdate({ schedule, edit, now, language }: BuildScheduleUpdateParams) {
    const input: ScheduleUpdateInput = { projectId: schedule.projectId, scheduleId: schedule.id };
    let changed = false;
    if (edit.name !== schedule.name) {
        input.name = edit.name;
        changed = true;
    }
    if (edit.prompt !== schedule.prompt) {
        input.prompt = edit.prompt;
        changed = true;
    }
    const current = parseSchedulePreset(schedule);
    if (edit.preset !== undefined && (current === null || !isSameSchedulePreset(current, edit.preset))) {
        const rule = buildSchedulePreset(edit.preset, now);
        input.rrule = rule.rrule;
        input.start = rule.start;
        input.when = describeSchedulePreset(edit.preset, language);
        changed = true;
    }
    return changed ? input : null;
}
