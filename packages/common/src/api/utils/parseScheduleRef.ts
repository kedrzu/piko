import { readString } from '../../utils/readString.js';
import type { ScheduleRef } from '../ScheduleTypes.js';

/**
 * The schedule a request body points at, or `undefined` when it does not hold both ids as strings.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseScheduleRef(value: object): ScheduleRef | undefined {
    const projectId = readString(value, 'projectId');
    const scheduleId = readString(value, 'scheduleId');
    return projectId !== undefined && scheduleId !== undefined ? { projectId, scheduleId } : undefined;
}
