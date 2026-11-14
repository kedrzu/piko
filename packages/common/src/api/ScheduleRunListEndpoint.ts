import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import type { ScheduleRef, ScheduleRun } from './ScheduleTypes.js';
import { createInputSchema } from './utils/createInputSchema.js';
import { parseScheduleRef } from './utils/parseScheduleRef.js';

const input = createInputSchema('{ projectId: string, scheduleId: string }', parseScheduleRef);

/**
 * A schedule's runs, newest first, at most the last 100. `404 ProjectNotFound` for an unknown project;
 * `404 ScheduleNotFound` for an unknown schedule.
 */
export const ScheduleRunListEndpoint = defineEndpoint<ScheduleRef, ScheduleRun[]>({
    name: 'schedules/runs',
    input,
});
