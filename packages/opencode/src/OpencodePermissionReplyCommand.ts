import { defineCommand } from '@nzyme/ioc/Command.js';

import { OpencodeClient } from './OpencodeClient.js';
import { createOpencodeStatusError } from './utils/createOpencodeStatusError.js';

/** How to answer a permission request: allow this once, allow it from now on, or refuse. */
export type OpencodePermissionDecision = 'once' | 'always' | 'reject';

/** Params of `OpencodePermissionReplyCommand`. */
export interface OpencodePermissionReplyCommandParams {
    sessionId: string;
    permissionId: string;
    decision: OpencodePermissionDecision;
}

/**
 * Answers a permission request the agent raised (a `permissionAsked` event). `notFound` when the request is no longer
 * pending (answered, or dropped with its run) or its session is gone.
 */
export interface OpencodePermissionReplyCommandShape {
    (params: OpencodePermissionReplyCommandParams): Promise<'replied' | 'notFound'>;
}

/** Answers a permission request. */
export const OpencodePermissionReplyCommand = defineCommand({
    name: 'OpencodePermissionReplyCommand',
    deps: { client: OpencodeClient },
    setup({ client }): OpencodePermissionReplyCommandShape {
        return async params => {
            const response = await client({
                method: 'POST',
                path: '/api/session/{sessionID}/permission/{requestID}/reply',
                pathParams: { sessionID: params.sessionId, requestID: params.permissionId },
                contentType: 'application/json',
                body: { decision: params.decision },
            });
            switch (response.status) {
                case 204:
                    return 'replied';
                case 404:
                    return 'notFound';
                default:
                    throw createOpencodeStatusError('replyPermission', response);
            }
        };
    },
});
