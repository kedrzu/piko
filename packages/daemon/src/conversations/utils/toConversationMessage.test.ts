import { expect, test } from 'bun:test';

import type { ConversationPluginMissingMessage, ConversationUserMessage } from '@piko/common/api/ConversationTypes.js';
import type { GenerativeUiAnswer } from '@piko/common/generativeUi/GenerativeUiAnswer.js';
import type { OpencodePromptMessage, OpencodeSyntheticMessage } from '@piko/opencode/OpencodeMessageListCommand.js';

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

test('a user message carries its answer only when its metadata reads as one', () => {
    const answer: GenerativeUiAnswer = {
        kind: 'generativeUiAnswer',
        source: 'choices',
        name: 'next',
        button: 'Yes',
        defaultButton: true,
        fields: [],
    };

    const answered: ConversationUserMessage = { type: 'user', id: 'msg_2', createdAt: 6, text: 'x', answer };
    const plain: ConversationUserMessage = { type: 'user', id: 'msg_2', createdAt: 6, text: 'x' };
    expect(toConversationMessage(prompt(answer))).toEqual(answered);
    expect(toConversationMessage(prompt({ ...answer, button: 3 }))).toEqual(plain);
    expect(toConversationMessage(prompt({ foo: 'bar' }))).toEqual(plain);
    expect(toConversationMessage(prompt(undefined))).toEqual(plain);
});

function prompt(metadata: Record<string, unknown> | undefined): OpencodePromptMessage {
    return { type: 'prompt', id: 'msg_2', createdAt: 6, text: 'x', metadata };
}

function synthetic(metadata: Record<string, unknown> | undefined): OpencodeSyntheticMessage {
    return { type: 'synthetic', id: 'msg_1', createdAt: 5, text: 'The command was not run.', metadata };
}
