import { expect, test } from 'bun:test';

import type { ConversationError } from '@poweragents/common/api/ConversationTypes.js';

import { toConversationError } from './toConversationError.js';

// OpenAI's own texts could not be triggered live; these follow the shapes OpenAI's API and Codex document.

test("OpenAI's 401 reads as signed out", () => {
    const error = toConversationError({
        kind: 'ProviderError',
        message: 'Your authentication token has been invalidated. Please try signing in again.',
        httpStatus: 401,
        responseBody: '{"error":{"code":"token_invalidated"}}',
    });

    const expected: ConversationError = { kind: 'signedOut' };
    expect(error).toEqual(expected);
});

test("ChatGPT's usage limit reads as the plan's limit", () => {
    const error = toConversationError({
        kind: 'ProviderError',
        message: "You've hit your usage limit. Upgrade to Pro or try again in 2 hours.",
        httpStatus: 429,
    });

    const expected: ConversationError = { kind: 'usageLimit' };
    expect(error).toEqual(expected);
});

test("any other error travels on as its message alone, never the provider's response body", () => {
    const error = toConversationError({
        kind: 'ProviderError',
        message: 'The model is overloaded',
        httpStatus: 503,
        responseBody: '{"echo":"the prompt sent"}',
    });

    const expected: ConversationError = { kind: 'other', message: 'The model is overloaded' };
    expect(error).toEqual(expected);
});
