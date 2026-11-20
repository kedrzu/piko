import type { DaemonStatus } from '@piko/common/daemonAddress.js';

/**
 * The answer to `GET /status`. It is open to any caller, so it carries nothing beyond running and the version; an unset
 * or empty `version` is left out, not sent as `null`.
 */
export function createStatusResponse(version: string | undefined): Response {
    const status: DaemonStatus = version ? { status: 'ok', version } : { status: 'ok' };
    return Response.json(status);
}
