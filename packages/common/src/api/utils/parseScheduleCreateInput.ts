import { readString } from '../../utils/readString.js';
import type { ScheduleCreateInput } from '../ScheduleTypes.js';

/**
 * A new schedule from a request body, or `undefined` when one of its six fields is not a string. Whether the rule is
 * valid is for the daemon to say.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseScheduleCreateInput(value: object): ScheduleCreateInput | undefined {
    const projectId = readString(value, 'projectId');
    const name = readString(value, 'name');
    const when = readString(value, 'when');
    const rrule = readString(value, 'rrule');
    const start = readString(value, 'start');
    const prompt = readString(value, 'prompt');
    return projectId !== undefined &&
        name !== undefined &&
        when !== undefined &&
        rrule !== undefined &&
        start !== undefined &&
        prompt !== undefined
        ? { projectId, name, when, rrule, start, prompt }
        : undefined;
}
