import { assertNever } from '@nzyme/utils/assertNever.js';

import { readGenerativeUiAnswer } from '@piko/common/generativeUi/GenerativeUiAnswer.js';
import type {
    ConversationAgentPart,
    ConversationMessage,
    ConversationStepStatus,
} from '@piko/common/api/ConversationTypes.js';
import type {
    OpencodeMessage,
    OpencodeReplyPart,
    OpencodeToolCallStatus,
} from '@piko/opencode/OpencodeMessageListCommand.js';

import { readPluginMissingNote } from './readPluginMissingNote.js';
import { toConversationError } from './toConversationError.js';
import { toConversationStep } from './toConversationStep.js';

/**
 * An agent's message as the conversation shows it; `undefined` for one that is not part of what was said (the daemon's
 * synthetic input, a model switch, a compaction, …). The one synthetic input shown is the note that a plugin's command
 * was not run, so it stays in the thread once the agent has read it.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function toConversationMessage(message: OpencodeMessage): ConversationMessage | undefined {
    switch (message.type) {
        case 'prompt': {
            const answer = readGenerativeUiAnswer(message.metadata);
            return {
                type: 'user',
                id: message.id,
                createdAt: message.createdAt,
                text: message.text,
                ...(answer && { answer }),
            };
        }
        case 'reply':
            return {
                type: 'agent',
                id: message.id,
                createdAt: message.createdAt,
                parts: message.parts.map(toAgentPart),
                error: message.error && toConversationError(message.error),
            };
        case 'runEnd':
            return {
                type: 'runEnd',
                id: message.id,
                createdAt: message.createdAt,
                outcome: message.outcome,
                error: message.error && toConversationError(message.error),
            };
        case 'synthetic': {
            // Any other synthetic input is the daemon's, not what was said.
            const plugin = readPluginMissingNote(message.metadata);
            return plugin === undefined
                ? undefined
                : { type: 'pluginMissing', id: message.id, createdAt: message.createdAt, plugin };
        }
        case 'other':
            return undefined;
        default:
            return assertNever(message, 'Unknown OpenCode message');
    }
}

function toAgentPart(part: OpencodeReplyPart): ConversationAgentPart {
    switch (part.type) {
        case 'text':
            return { type: 'text', text: part.text };
        case 'tool':
            return {
                type: 'step',
                ...toConversationStep({
                    callId: part.callId,
                    toolName: part.name,
                    input: part.input,
                    status: toStepStatus(part.status),
                    error: part.error?.message,
                }),
            };
        default:
            return assertNever(part, 'Unknown OpenCode reply part');
    }
}

function toStepStatus(status: OpencodeToolCallStatus): ConversationStepStatus {
    switch (status) {
        case 'pending':
        case 'running':
            return 'running';
        case 'completed':
            return 'done';
        case 'failed':
            return 'failed';
        default:
            return assertNever(status, 'Unknown OpenCode tool call status');
    }
}
