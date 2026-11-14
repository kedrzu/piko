import { defineCommand } from '@nzyme/ioc/Command.js';

import { OpencodeClient } from './OpencodeClient.js';
import { createOpencodeStatusError } from './utils/createOpencodeStatusError.js';

/** Params of `OpencodeIntegrationOauthStartCommand`. */
export interface OpencodeIntegrationOauthStartCommandParams {
    integrationId: string;
    /** The integration's `oauth` method, e.g. `chatgpt-token-sharing`. */
    methodId: string;
}

/** A started OAuth sign-in attempt. */
export interface OpencodeIntegrationOauthStartCommandResult {
    attemptId: string;
    /** The page the person signs in on. */
    url: string;
    /** When the attempt expires (server clock, epoch ms); absent when OpenCode reports no finite expiry. */
    expiresAt?: number;
}

/** Starts an OAuth sign-in attempt; poll it with `OpencodeIntegrationOauthStatusCommand`. */
export interface OpencodeIntegrationOauthStartCommandShape {
    (params: OpencodeIntegrationOauthStartCommandParams): Promise<OpencodeIntegrationOauthStartCommandResult>;
}

/** Starts an integration's OAuth sign-in. */
export const OpencodeIntegrationOauthStartCommand = defineCommand({
    name: 'OpencodeIntegrationOauthStartCommand',
    deps: { client: OpencodeClient },
    setup({ client }): OpencodeIntegrationOauthStartCommandShape {
        return async params => {
            const response = await client({
                method: 'POST',
                path: '/api/integration/{integrationID}/connect/oauth',
                pathParams: { integrationID: params.integrationId },
                contentType: 'application/json',
                body: { methodID: params.methodId },
            });
            if (response.status !== 200) {
                throw createOpencodeStatusError('startIntegrationOauth', response);
            }
            const attempt = response.data.data;
            const expires = attempt.time.expires;
            return {
                attemptId: attempt.attemptID,
                url: attempt.url,
                // "Infinity" / "NaN" arrive as strings: no usable deadline.
                expiresAt: typeof expires === 'number' && Number.isFinite(expires) ? expires : undefined,
            };
        };
    },
});
