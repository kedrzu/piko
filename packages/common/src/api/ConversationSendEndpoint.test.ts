import { expect, test } from 'bun:test';

import type { GenerativeUiAnswer } from '../generativeUi/GenerativeUiAnswer.js';
import { ConversationSendEndpoint } from './ConversationSendEndpoint.js';
import type { ConversationSendInput } from './ConversationTypes.js';

const ref = { projectId: 'p1', conversationId: 'c1' };
const answer: GenerativeUiAnswer = {
    kind: 'generativeUiAnswer',
    source: 'choices',
    name: 'next',
    button: 'Yes',
    defaultButton: true,
    fields: [],
};

test.each<[string, unknown, ConversationSendInput | undefined]>([
    ['text', { ...ref, text: 'Hi' }, { ...ref, text: 'Hi' }],
    ['an answer', { ...ref, answer }, { ...ref, answer }],
    ['neither', ref, undefined],
    ['both', { ...ref, text: 'Hi', answer }, undefined],
    ['an invalid answer', { ...ref, answer: { ...answer, button: 1 } }, undefined],
    ['an invalid answer next to text', { ...ref, text: 'Hi', answer: 'nope' }, undefined],
    ['a missing conversation', { projectId: 'p1', text: 'Hi' }, undefined],
])('parses %s', async (_case, body, expected) => {
    const result = await ConversationSendEndpoint.input!['~standard'].validate(body);

    if (expected === undefined) {
        expect(result.issues).toBeDefined();
    } else {
        expect(result).toEqual({ value: expected });
    }
});
