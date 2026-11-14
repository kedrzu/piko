import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { ScheduleRunListEndpoint } from '@poweragents/common/api/ScheduleRunListEndpoint.js';

import { ScheduleService } from '../schedules/ScheduleService.js';

/** Serves `ScheduleRunListEndpoint`. */
export const ScheduleRunListEndpointHandler = defineEndpointHandler({
    endpoint: ScheduleRunListEndpoint,
    deps: { schedules: ScheduleService },
    setup({ schedules }) {
        return input => schedules.listRuns(input);
    },
});
