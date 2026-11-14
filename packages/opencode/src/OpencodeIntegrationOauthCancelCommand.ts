import { defineCommand } from '@nzyme/ioc/Command.js';

import { OpencodeClient } from './OpencodeClient.js';
import { createOpencodeStatusError } from './utils/createOpencodeStatusError.js';

/** Params of `OpencodeIntegrationOauthCancelCommand`. */
export interface OpencodeIntegrationOauthCancelCommandParams {
    integrationId: string;
    attemptId: string;
}

/** Cancels an OAuth sign-in attempt; an attempt OpenCode no longer knows is already gone, not an error. */
export interface OpencodeIntegrationOauthCancelCommandShape {
    (params: OpencodeIntegrationOauthCancelCommandParams): Promise<void>;
}

/** Cancels an OAuth sign-in attempt. */
export const OpencodeIntegrationOauthCancelCommand = defineCommand({
    name: 'OpencodeIntegrationOauthCancelCommand',
    deps: { client: OpencodeClient },
    setup({ client }): OpencodeIntegrationOauthCancelCommandShape {
        return async params => {
            const response = await client({
                method: 'DELETE',
                path: '/api/integration/{integrationID}/connect/oauth/{attemptID}',
                pathParams: { integrationID: params.integrationId, attemptID: params.attemptId },
            });
            if (response.status !== 204 && response.status !== 404) {
                throw createOpencodeStatusError('cancelIntegrationOauth', response);
            }
        };
    },
});
