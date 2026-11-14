import { expect, mock, test } from 'bun:test';

import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

import type { AiProvider, AiStatus } from '@poweragents/common/api/AiTypes.js';
import type { ChatgptStatus } from '@poweragents/common/api/ChatgptTypes.js';
import type { ClaudeStatus } from '@poweragents/common/api/ClaudeTypes.js';

import { ChatgptSignInService } from '../chatgpt/ChatgptSignInService.js';
import { ClaudeSignInService } from '../claude/ClaudeSignInService.js';
import { ActiveProviderStore } from './ActiveProviderStore.js';
import { AiProviderService } from './AiProviderService.js';

// The sign-in services are the boundary (they ask the sandbox); the record is kept in memory, never in the real
// `~/.poweragents/ai-provider.json`.

const CLAUDE_MAX: ClaudeStatus = { connected: true, email: 'ola@example.com', plan: 'max', planAllowed: true };

test('without a record, a connected Claude stays active, ChatGPT is not asked and nothing is recorded', async () => {
    const fixture = setup({ claude: CLAUDE_MAX, chatgpt: { connected: true } });

    const status = await fixture.service.getStatus();

    const expected: AiStatus = {
        connected: true,
        provider: 'claude',
        email: 'ola@example.com',
        plan: 'max',
        planAllowed: true,
    };
    expect(status).toEqual(expected);
    expect(await fixture.service.getActive()).toBe('claude');
    expect(fixture.chatgptStatus).not.toHaveBeenCalled();
    expect(fixture.setRecord).not.toHaveBeenCalled();
});

test('without a record, Claude on a plan not allowed is reported, and nothing is active', async () => {
    const fixture = setup({
        claude: { ...CLAUDE_MAX, plan: 'free', planAllowed: false },
        chatgpt: { connected: true },
    });

    const status = await fixture.service.getStatus();

    expect(status).toMatchObject({ connected: true, provider: 'claude', planAllowed: false });
    expect(await fixture.service.getActive()).toBeUndefined();
    expect(fixture.chatgptStatus).not.toHaveBeenCalled();
});

test('without a record and Claude signed out, a connected ChatGPT is active, still unrecorded', async () => {
    const fixture = setup({ claude: { connected: false }, chatgpt: { connected: true } });

    const status = await fixture.service.getStatus();

    const expected: AiStatus = { connected: true, provider: 'chatgpt', email: null, plan: null, planAllowed: true };
    expect(status).toEqual(expected);
    expect(await fixture.service.getActive()).toBe('chatgpt');
    expect(fixture.setRecord).not.toHaveBeenCalled();
});

test('without a record and nothing connected, no provider is active', async () => {
    const fixture = setup({ claude: { connected: false }, chatgpt: { connected: false } });

    const expected: AiStatus = { connected: false, provider: null };
    expect(await fixture.service.getStatus()).toEqual(expected);
    expect(await fixture.service.getActive()).toBeUndefined();
});

test('a recorded provider that is signed out is reported so and stays active, never falling back to the other one', async () => {
    const fixture = setup({ recorded: 'chatgpt', claude: CLAUDE_MAX, chatgpt: { connected: false } });

    const expected: AiStatus = { connected: false, provider: 'chatgpt' };
    expect(await fixture.service.getStatus()).toEqual(expected);
    expect(await fixture.service.getActive()).toBe('chatgpt');
    expect(fixture.claudeStatus).not.toHaveBeenCalled();
});

test('a recorded provider is active without a status check', async () => {
    const fixture = setup({ recorded: 'claude', claude: CLAUDE_MAX, chatgpt: { connected: true } });

    expect(await fixture.service.getActive()).toBe('claude');
    expect(fixture.claudeStatus).not.toHaveBeenCalled();
    expect(fixture.chatgptStatus).not.toHaveBeenCalled();
});

test('a status check that fails throws', async () => {
    const fixture = setup({ recorded: 'chatgpt', claude: CLAUDE_MAX, chatgpt: { connected: true } });
    fixture.chatgptStatus.mockImplementation(() => Promise.reject(new Error('OpenCode has no openai integration')));

    await expect(fixture.service.getStatus()).rejects.toThrow('OpenCode has no openai integration');
});

interface SetupParams {
    recorded?: AiProvider;
    claude: ClaudeStatus;
    chatgpt: ChatgptStatus;
}

function setup(params: SetupParams) {
    const { container } = createTestContainer();
    const setRecord = mock((_provider: AiProvider) => Promise.resolve());
    container.set(ActiveProviderStore, { get: () => Promise.resolve(params.recorded), set: setRecord });
    const claudeStatus = mock(() => Promise.resolve(params.claude));
    container.set(ClaudeSignInService, {
        getStatus: claudeStatus,
        startLogin: notUsed,
        completeLogin: notUsed,
        connectAgent: notUsed,
    });
    const chatgptStatus = mock(() => Promise.resolve(params.chatgpt));
    container.set(ChatgptSignInService, {
        getStatus: chatgptStatus,
        startLogin: notUsed,
        getLoginState: notUsed,
        cancelLogin: notUsed,
    });
    return { service: container.resolve(AiProviderService), setRecord, claudeStatus, chatgptStatus };
}

function notUsed(): Promise<never> {
    return Promise.reject(new Error('not used'));
}
