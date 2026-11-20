import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { ScheduleCreateEndpoint } from '@piko/common/api/ScheduleCreateEndpoint.js';

import { ScheduleService } from '../schedules/ScheduleService.js';

/** Serves `ScheduleCreateEndpoint`. */
export const ScheduleCreateEndpointHandler = defineEndpointHandler({
    endpoint: ScheduleCreateEndpoint,
    deps: { schedules: ScheduleService },
    setup({ schedules }) {
        return input => schedules.create(input);
    },
});
