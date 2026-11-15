import { defineCommand } from '@nzyme/ioc/Command.js';
import { assertNever } from '@nzyme/utils/assertNever.js';

import { OpencodeClient } from './OpencodeClient.js';
import { createOpencodeStatusError } from './utils/createOpencodeStatusError.js';

/**
 * Input waiting in a session's inbox, not yet given to the agent: the person's `prompt` or the daemon's `synthetic`
 * input.
 */
export interface OpencodeInboxItem {
    type: 'prompt' | 'synthetic';
    /** The id the message will be listed under once delivered. */
    id: string;
    /** Server clock, epoch ms. */
    createdAt: number;
    text: string;
    metadata?: Record<string, unknown>;
}

/**
 * The input waiting in a session's inbox, in the order it came: prompts and synthetic input sent while a run was busy or
 * with `resume: false`. OpenCode's own items (compaction, move) are left out.
 */
export interface OpencodeSessionInboxListCommandShape {
    (sessionId: string): Promise<OpencodeInboxItem[]>;
}

/** Lists a session's inbox. */
export const OpencodeSessionInboxListCommand = defineCommand({
    name: 'OpencodeSessionInboxListCommand',
    deps: { client: OpencodeClient },
    setup({ client }): OpencodeSessionInboxListCommandShape {
        return async sessionId => {
            const response = await client({
                method: 'GET',
                path: '/api/session/{sessionID}/inbox',
                pathParams: { sessionID: sessionId },
            });
            if (response.status !== 200) {
                throw createOpencodeStatusError('listInbox', response);
            }

            const items: OpencodeInboxItem[] = [];
            for (const item of response.data.data) {
                switch (item.type) {
                    case 'user':
                    case 'synthetic':
                        items.push({
                            type: item.type === 'user' ? 'prompt' : 'synthetic',
                            id: item.id,
                            createdAt: item.time.created,
                            text: item.payload.text,
                            metadata: item.payload.metadata,
                        });
                        break;
                    case 'compaction':
                    case 'move':
                        break;
                    default:
                        assertNever(item, 'Unknown OpenCode inbox item');
                }
            }
            return items;
        };
    },
});
