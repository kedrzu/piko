import { defineCommand } from '@nzyme/ioc/Command.js';

import { OpencodeClient } from './OpencodeClient.js';
import { createOpencodeStatusError } from './utils/createOpencodeStatusError.js';

/** Params of `OpencodeSessionSyntheticCommand`. */
export interface OpencodeSessionSyntheticCommandParams {
    sessionId: string;
    /** What the agent is told, as its input for the run. */
    text: string;
    /** What the daemon attaches to it, kept with the message and read back when the session is listed. */
    metadata?: Record<string, unknown>;
    /**
     * Whether the input starts a run (the default). With `false` it waits in the session's inbox, and an idle session
     * stays idle.
     */
    resume?: boolean;
}

/**
 * Gives the agent input that does not come from the person and, unless told not to, starts a run on it; does not wait for
 * the agent. OpenCode keeps it as a `synthetic` message, never as one the person sent.
 */
export interface OpencodeSessionSyntheticCommandShape {
    (params: OpencodeSessionSyntheticCommandParams): Promise<void>;
}

/** Sends synthetic input to a session. */
export const OpencodeSessionSyntheticCommand = defineCommand({
    name: 'OpencodeSessionSyntheticCommand',
    deps: { client: OpencodeClient },
    setup({ client }): OpencodeSessionSyntheticCommandShape {
        return async params => {
            const response = await client({
                method: 'POST',
                path: '/api/session/{sessionID}/synthetic',
                pathParams: { sessionID: params.sessionId },
                contentType: 'application/json',
                body: { text: params.text, metadata: params.metadata, resume: params.resume },
            });
            if (response.status !== 200) {
                throw createOpencodeStatusError('synthetic', response);
            }
        };
    },
});
