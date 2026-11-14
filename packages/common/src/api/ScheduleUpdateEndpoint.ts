import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import type { Schedule, ScheduleUpdateInput } from './ScheduleTypes.js';
import { createInputSchema } from './utils/createInputSchema.js';
import { parseScheduleUpdateInput } from './utils/parseScheduleUpdateInput.js';

const input = createInputSchema(
    '{ projectId: string, scheduleId: string, name?: string, when?: string, rrule?: string, start?: string, prompt?: string, paused?: boolean }',
    parseScheduleUpdateInput,
);

/**
 * Changes a schedule; pausing and resuming is `paused`. `404 ProjectNotFound` for an unknown project;
 * `404 ScheduleNotFound` for an unknown schedule; `400 InvalidSchedule` with what is wrong.
 */
export const ScheduleUpdateEndpoint = defineEndpoint<ScheduleUpdateInput, Schedule>({
    name: 'schedules/update',
    input,
});
