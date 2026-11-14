import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import type { Schedule, ScheduleListInput } from './ScheduleTypes.js';
import { createInputSchema } from './utils/createInputSchema.js';
import { parseScheduleListInput } from './utils/parseScheduleListInput.js';

const input = createInputSchema('{ projectId?: string }', parseScheduleListInput);

/**
 * A project's schedules, or with no `projectId` every project's, sorted by project, then schedule name. Invalid
 * schedule files are not listed. `404 ProjectNotFound` for an unknown project.
 */
export const ScheduleListEndpoint = defineEndpoint<ScheduleListInput, Schedule[]>({
    name: 'schedules/list',
    input,
});
