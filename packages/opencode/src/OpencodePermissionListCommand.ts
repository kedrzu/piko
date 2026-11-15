import { defineCommand } from '@nzyme/ioc/Command.js';

import { OpencodeClient } from './OpencodeClient.js';
import { createOpencodeStatusError } from './utils/createOpencodeStatusError.js';

/** A permission request the agent waits on; answer it with `OpencodePermissionReplyCommand`. */
export interface OpencodePermissionRequest {
    sessionId: string;
    permissionId: string;
    /** What the agent wants to do, e.g. `edit`. */
    action: string;
    /** What it wants to do it to: paths (relative to the session's folder), commands, URLs. */
    resources: string[];
}

/**
 * The permission requests pending in the sessions working in `directory` (as the container sees it). None for a
 * folder OpenCode has no location for.
 */
export interface OpencodePermissionListCommandShape {
    (directory: string): Promise<OpencodePermissionRequest[]>;
}

/** Lists the pending permission requests of a working directory. */
export const OpencodePermissionListCommand = defineCommand({
    name: 'OpencodePermissionListCommand',
    deps: { client: OpencodeClient },
    setup({ client }): OpencodePermissionListCommandShape {
        return async directory => {
            const response = await client({
                method: 'GET',
                path: '/api/permission/request',
                query: { location: { directory } },
            });
            switch (response.status) {
                case 200:
                    return response.data.data.map(request => ({
                        sessionId: request.sessionID,
                        permissionId: request.id,
                        action: request.action,
                        resources: request.resources,
                    }));
                case 404:
                    return [];
                default:
                    throw createOpencodeStatusError('listPermissions', response);
            }
        };
    },
});
