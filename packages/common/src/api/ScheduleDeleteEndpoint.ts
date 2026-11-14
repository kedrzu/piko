import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import type { ScheduleRef } from './ScheduleTypes.js';
import { createInputSchema } from './utils/createInputSchema.js';
import { parseScheduleRef } from './utils/parseScheduleRef.js';

const input = createInputSchema('{ projectId: string, scheduleId: string }', parseScheduleRef);

/**
 * Removes a schedule and its run history. `404 ProjectNotFound` for an unknown project; `404 ScheduleNotFound` for
 * an unknown schedule.
 */
export const ScheduleDeleteEndpoint = defineEndpoint<ScheduleRef>({
    name: 'schedules/delete',
    input,
});
