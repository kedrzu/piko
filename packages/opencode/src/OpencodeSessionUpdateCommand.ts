import { defineCommand } from '@nzyme/ioc/Command.js';

import { OpencodeClient } from './OpencodeClient.js';
import type { OpencodePermissionRule } from './OpencodeTypes.js';
import { createOpencodeStatusError } from './utils/createOpencodeStatusError.js';

/** Params of `OpencodeSessionUpdateCommand`. */
export interface OpencodeSessionUpdateCommandParams {
    sessionId: string;
    /** Replaces the session's own permission rules; the global ones stay. */
    permissions: OpencodePermissionRule[];
}

/** Replaces a session's permission rules; they apply from the next run on. */
export interface OpencodeSessionUpdateCommandShape {
    (params: OpencodeSessionUpdateCommandParams): Promise<void>;
}

/** Updates a session's permissions. */
export const OpencodeSessionUpdateCommand = defineCommand({
    name: 'OpencodeSessionUpdateCommand',
    deps: { client: OpencodeClient },
    setup({ client }): OpencodeSessionUpdateCommandShape {
        return async params => {
            const response = await client({
                method: 'PATCH',
                path: '/api/session/{sessionID}',
                pathParams: { sessionID: params.sessionId },
                contentType: 'application/json',
                body: { permissions: params.permissions },
            });
            if (response.status !== 204) {
                throw createOpencodeStatusError('updateSession', response);
            }
        };
    },
});
