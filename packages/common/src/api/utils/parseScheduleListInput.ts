import { isOptionalProperty } from '../../utils/isOptionalProperty.js';
import { readString } from '../../utils/readString.js';
import type { ScheduleListInput } from '../ScheduleTypes.js';

/**
 * The project to list schedules of, or `undefined` when `projectId` is present but not a string.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseScheduleListInput(value: object): ScheduleListInput | undefined {
    if (!isOptionalProperty(value, 'projectId', 'string')) {
        return undefined;
    }
    const projectId = readString(value, 'projectId');
    return projectId === undefined ? {} : { projectId };
}
