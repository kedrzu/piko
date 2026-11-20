import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { ScheduleDeleteEndpoint } from '@piko/common/api/ScheduleDeleteEndpoint.js';

import { ScheduleService } from '../schedules/ScheduleService.js';

/** Serves `ScheduleDeleteEndpoint`. */
export const ScheduleDeleteEndpointHandler = defineEndpointHandler({
    endpoint: ScheduleDeleteEndpoint,
    deps: { schedules: ScheduleService },
    setup({ schedules }) {
        return input => schedules.remove(input);
    },
});
