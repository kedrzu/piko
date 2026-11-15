import { defineCommand } from '@nzyme/ioc/Command.js';
import { Logger } from '@nzyme/logging/Logger.js';

import { OpencodeClient } from './OpencodeClient.js';
import { createOpencodeStatusError } from './utils/createOpencodeStatusError.js';

/** A prompt taken back from a session's inbox. */
export interface OpencodeInboxPrompt {
    /** The prompt's id: the receipt's `messageId`, which the message would have been listed under once delivered. */
    id: string;
    text: string;
}

/** Options of `OpencodeSessionInboxClearCommand`. */
export interface OpencodeSessionInboxClearOptions {
    /**
     * Also cancels the synthetic input whose metadata holds every one of these entries: the caller's own, told apart
     * from OpenCode's and from other callers' synthetic input by them.
     */
    syntheticMetadata?: Record<string, string>;
}

/**
 * Cancels the person's prompts still waiting in the session's inbox (sent while a run was busy and not yet given to the
 * agent) and resolves them, in the order they were sent. Synthetic input stays, unless it matches
 * `syntheticMetadata`; OpenCode's own items (compaction, move) always stay. Call it on an idle session: a running one may
 * deliver a prompt between the listing and its cancel, which OpenCode then ignores, and it would be returned although
 * the agent got it.
 */
export interface OpencodeSessionInboxClearCommandShape {
    (sessionId: string, options?: OpencodeSessionInboxClearOptions): Promise<OpencodeInboxPrompt[]>;
}

/** Takes back the prompts waiting in a session's inbox. */
export const OpencodeSessionInboxClearCommand = defineCommand({
    name: 'OpencodeSessionInboxClearCommand',
    deps: { client: OpencodeClient, logger: Logger },
    setup({ client, logger }): OpencodeSessionInboxClearCommandShape {
        return async (sessionId, options = {}) => {
            const listed = await client({
                method: 'GET',
                path: '/api/session/{sessionID}/inbox',
                pathParams: { sessionID: sessionId },
            });
            if (listed.status !== 200) {
                throw createOpencodeStatusError('listInbox', listed);
            }

            const prompts: OpencodeInboxPrompt[] = [];
            let syntheticCount = 0;
            for (const item of listed.data.data) {
                const ours =
                    item.type === 'synthetic' &&
                    options.syntheticMetadata !== undefined &&
                    hasEntries(item.payload.metadata, options.syntheticMetadata);
                if (item.type !== 'user' && !ours) {
                    continue;
                }
                const cancelled = await client({
                    method: 'DELETE',
                    path: '/api/session/{sessionID}/inbox/{inboxID}',
                    pathParams: { sessionID: sessionId, inboxID: item.id },
                });
                if (cancelled.status !== 204) {
                    throw createOpencodeStatusError('cancelInbox', cancelled);
                }
                if (item.type === 'user') {
                    prompts.push({ id: item.id, text: item.payload.text });
                } else {
                    syntheticCount++;
                }
            }

            if (prompts.length > 0 || syntheticCount > 0) {
                logger.info('OpenCode inbox items cancelled', { sessionId, count: prompts.length, syntheticCount });
            }
            return prompts;
        };
    },
});

/** @__NO_SIDE_EFFECTS__ */
function hasEntries(metadata: Record<string, unknown> | undefined, entries: Record<string, string>) {
    if (!metadata) {
        return false;
    }
    for (const [key, value] of Object.entries(entries)) {
        if (metadata[key] !== value) {
            return false;
        }
    }
    return true;
}
