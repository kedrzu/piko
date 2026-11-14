import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import type { Schedule, ScheduleCreateInput } from './ScheduleTypes.js';
import { createInputSchema } from './utils/createInputSchema.js';
import { parseScheduleCreateInput } from './utils/parseScheduleCreateInput.js';

const input = createInputSchema(
    '{ projectId: string, name: string, when: string, rrule: string, start: string, prompt: string }',
    parseScheduleCreateInput,
);

/** Creates a schedule. `404 ProjectNotFound` for an unknown project; `400 InvalidSchedule` with what is wrong. */
export const ScheduleCreateEndpoint = defineEndpoint<ScheduleCreateInput, Schedule>({
    name: 'schedules/create',
    input,
});
