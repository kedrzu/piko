import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { ScheduleListEndpoint } from '@piko/common/api/ScheduleListEndpoint.js';

import { ScheduleService } from '../schedules/ScheduleService.js';

/** Serves `ScheduleListEndpoint`. */
export const ScheduleListEndpointHandler = defineEndpointHandler({
    endpoint: ScheduleListEndpoint,
    deps: { schedules: ScheduleService },
    setup({ schedules }) {
        return input => schedules.list(input.projectId);
    },
});
