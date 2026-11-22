import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import type { ConversationSendInput, ConversationSendResult } from './ConversationTypes.js';
import { readGenerativeUiAnswer } from '../generativeUi/GenerativeUiAnswer.js';
import { readString } from '../utils/readString.js';
import { createInputSchema } from './utils/createInputSchema.js';
import { parseConversationRef } from './utils/parseConversationRef.js';

const input = createInputSchema<ConversationSendInput>(
    '{ projectId: string, conversationId: string } and exactly one of { text: string } or { answer: GenerativeUiAnswer }',
    value => {
        const ref = parseConversationRef(value);
        if (!ref) {
            return undefined;
        }
        const text = readString(value, 'text');
        const rawAnswer: unknown = Reflect.get(value, 'answer');
        if (rawAnswer === undefined) {
            return text === undefined ? undefined : { ...ref, text };
        }
        const answer = readGenerativeUiAnswer(rawAnswer);
        return text === undefined && answer !== undefined ? { ...ref, answer } : undefined;
    },
);

/**
 * Sends the person's message; the agent's work on it streams as events. `404 ConversationNotFound` for a conversation
 * not in the project.
 */
export const ConversationSendEndpoint = defineEndpoint<ConversationSendInput, ConversationSendResult>({
    name: 'conversations/send',
    input,
});
