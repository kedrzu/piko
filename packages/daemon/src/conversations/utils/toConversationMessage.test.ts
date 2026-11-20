import { expect, test } from 'bun:test';

import type { ConversationPluginMissingMessage } from '@piko/common/api/ConversationTypes.js';
import type { OpencodeSyntheticMessage } from '@piko/opencode/OpencodeMessageListCommand.js';

import { toConversationMessage } from './toConversationMessage.js';

test("keeps the delivered note that a plugin's command was not run in the thread, hiding other synthetic input", () => {
    const note = synthetic({ piko: 'pluginMissing', plugin: 'gmail' });

    const expected: ConversationPluginMissingMessage = {
        type: 'pluginMissing',
        id: 'msg_1',
        createdAt: 5,
        plugin: 'gmail',
    };
    expect(toConversationMessage(note)).toEqual(expected);
    expect(toConversationMessage(synthetic(undefined))).toBeUndefined();
    expect(toConversationMessage(synthetic({ plugin: 'gmail' }))).toBeUndefined();
    expect(toConversationMessage(synthetic({ piko: 'onboarding', plugin: 'gmail' }))).toBeUndefined();
});

function synthetic(metadata: Record<string, unknown> | undefined): OpencodeSyntheticMessage {
    return { type: 'synthetic', id: 'msg_1', createdAt: 5, text: 'The command was not run.', metadata };
}
