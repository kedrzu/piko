import { isOptionalProperty } from '../../utils/isOptionalProperty.js';
import { readBoolean } from '../../utils/readBoolean.js';
import { readString } from '../../utils/readString.js';
import type { ScheduleUpdateInput } from '../ScheduleTypes.js';
import { parseScheduleRef } from './parseScheduleRef.js';

const STRING_FIELDS = ['name', 'when', 'rrule', 'start', 'prompt'] as const;

/**
 * A schedule change from a request body, or `undefined` when the ids are not strings or a field present is of the
 * wrong type. Whether the rule is valid is for the daemon to say.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseScheduleUpdateInput(value: object): ScheduleUpdateInput | undefined {
    const ref = parseScheduleRef(value);
    if (
        !ref ||
        !STRING_FIELDS.every(key => isOptionalProperty(value, key, 'string')) ||
        !isOptionalProperty(value, 'paused', 'boolean')
    ) {
        return undefined;
    }
    const input: ScheduleUpdateInput = { ...ref };
    for (const key of STRING_FIELDS) {
        const field = readString(value, key);
        if (field !== undefined) {
            input[key] = field;
        }
    }
    const paused = readBoolean(value, 'paused');
    if (paused !== undefined) {
        input.paused = paused;
    }
    return input;
}
