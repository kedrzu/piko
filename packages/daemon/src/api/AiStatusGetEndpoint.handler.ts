import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { AiStatusGetEndpoint } from '@piko/common/api/AiStatusGetEndpoint.js';

import { AiProviderService } from '../ai/AiProviderService.js';

/** Serves `AiStatusGetEndpoint`. */
export const AiStatusGetEndpointHandler = defineEndpointHandler({
    endpoint: AiStatusGetEndpoint,
    deps: { aiProvider: AiProviderService },
    setup({ aiProvider }) {
        return () => aiProvider.getStatus();
    },
});
