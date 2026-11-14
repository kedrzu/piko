import { defineCommand } from '@nzyme/ioc/Command.js';

import { OpencodeClient } from './OpencodeClient.js';
import { createOpencodeStatusError } from './utils/createOpencodeStatusError.js';

/**
 * Whether the session has a pending form, or `null` when OpenCode has no such session. Forms are the agent's
 * questions to the person; this tells whether a scheduled run still waits for them.
 */
export interface OpencodeSessionFormListCommandShape {
    (sessionId: string): Promise<boolean | null>;
}

/** Checks a session for pending forms; OpenCode lists only the unanswered ones. */
export const OpencodeSessionFormListCommand = defineCommand({
    name: 'OpencodeSessionFormListCommand',
    deps: { client: OpencodeClient },
    setup({ client }): OpencodeSessionFormListCommandShape {
        return async sessionId => {
            const response = await client({
                method: 'GET',
                path: '/api/session/{sessionID}/form',
                pathParams: { sessionID: sessionId },
            });
            switch (response.status) {
                case 200:
                    return response.data.data.length > 0;
                case 404:
                    return null;
                default:
                    throw createOpencodeStatusError('listSessionForms', response);
            }
        };
    },
});
