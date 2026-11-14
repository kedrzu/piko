import { defineCommand } from '@nzyme/ioc/Command.js';
import { assertNever } from '@nzyme/utils/assertNever.js';

import { OpencodeClient } from './OpencodeClient.js';
import { createOpencodeStatusError } from './utils/createOpencodeStatusError.js';

/** Params of `OpencodeIntegrationOauthStatusCommand`. */
export interface OpencodeIntegrationOauthStatusCommandParams {
    integrationId: string;
    attemptId: string;
}

/** Where an OAuth sign-in attempt stands. */
export type OpencodeIntegrationOauthStatus =
    | { status: 'pending' }
    | { status: 'complete' }
    | { status: 'failed'; message: string }
    | { status: 'expired' };

/** The status of an OAuth attempt; `undefined` when OpenCode does not know the attempt. */
export interface OpencodeIntegrationOauthStatusCommandShape {
    (params: OpencodeIntegrationOauthStatusCommandParams): Promise<OpencodeIntegrationOauthStatus | undefined>;
}

/** Reads the status of an OAuth sign-in attempt. */
export const OpencodeIntegrationOauthStatusCommand = defineCommand({
    name: 'OpencodeIntegrationOauthStatusCommand',
    deps: { client: OpencodeClient },
    setup({ client }): OpencodeIntegrationOauthStatusCommandShape {
        return async params => {
            const response = await client({
                method: 'GET',
                path: '/api/integration/{integrationID}/connect/oauth/{attemptID}',
                pathParams: { integrationID: params.integrationId, attemptID: params.attemptId },
            });
            switch (response.status) {
                case 200: {
                    const attempt = response.data.data;
                    switch (attempt.status) {
                        case 'pending':
                        case 'complete':
                        case 'expired':
                            return { status: attempt.status };
                        case 'failed':
                            return { status: 'failed', message: attempt.message };
                        default:
                            return assertNever(attempt);
                    }
                }
                case 404:
                    return undefined;
                default:
                    throw createOpencodeStatusError('getIntegrationOauthAttempt', response);
            }
        };
    },
});
