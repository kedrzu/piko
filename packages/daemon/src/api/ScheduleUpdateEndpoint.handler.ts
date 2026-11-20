import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { ScheduleUpdateEndpoint } from '@piko/common/api/ScheduleUpdateEndpoint.js';

import { ScheduleService } from '../schedules/ScheduleService.js';

/** Serves `ScheduleUpdateEndpoint`. */
export const ScheduleUpdateEndpointHandler = defineEndpointHandler({
    endpoint: ScheduleUpdateEndpoint,
    deps: { schedules: ScheduleService },
    setup({ schedules }) {
        return input => schedules.update(input);
    },
});
