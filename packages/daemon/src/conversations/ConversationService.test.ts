import { expect, mock, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';

import type { ChatgptStatus } from '@poweragents/common/api/ChatgptTypes.js';
import type { ClaudeStatus } from '@poweragents/common/api/ClaudeTypes.js';
import type {
    Conversation,
    ConversationMessagePage,
    ConversationSendResult,
    ConversationStopResult,
} from '@poweragents/common/api/ConversationTypes.js';
import type { Project, ProjectCreateResult } from '@poweragents/common/api/ProjectTypes.js';
import { OpencodeMessageListCommand } from '@poweragents/opencode/OpencodeMessageListCommand.js';
import type {
    OpencodeMessageListCommandParams,
    OpencodeMessagePage,
} from '@poweragents/opencode/OpencodeMessageListCommand.js';
import { OpencodeSessionActiveListCommand } from '@poweragents/opencode/OpencodeSessionActiveListCommand.js';
import { OpencodeSessionCreateCommand } from '@poweragents/opencode/OpencodeSessionCreateCommand.js';
import type { OpencodeSessionCreateCommandParams } from '@poweragents/opencode/OpencodeSessionCreateCommand.js';
import { OpencodeSessionGetCommand } from '@poweragents/opencode/OpencodeSessionGetCommand.js';
import { OpencodeSessionInboxClearCommand } from '@poweragents/opencode/OpencodeSessionInboxClearCommand.js';
import type {
    OpencodeInboxPrompt,
    OpencodeSessionInboxClearOptions,
} from '@poweragents/opencode/OpencodeSessionInboxClearCommand.js';
import { OpencodeSessionInboxListCommand } from '@poweragents/opencode/OpencodeSessionInboxListCommand.js';
import type { OpencodeInboxItem } from '@poweragents/opencode/OpencodeSessionInboxListCommand.js';
import { OpencodeSessionInterruptCommand } from '@poweragents/opencode/OpencodeSessionInterruptCommand.js';
import { OpencodeSessionListCommand } from '@poweragents/opencode/OpencodeSessionListCommand.js';
import { OpencodeSessionPromptCommand } from '@poweragents/opencode/OpencodeSessionPromptCommand.js';
import type {
    OpencodePromptReceipt,
    OpencodeSessionPromptCommandParams,
} from '@poweragents/opencode/OpencodeSessionPromptCommand.js';
import { OpencodeSessionSyntheticCommand } from '@poweragents/opencode/OpencodeSessionSyntheticCommand.js';
import type { OpencodeSessionSyntheticCommandParams } from '@poweragents/opencode/OpencodeSessionSyntheticCommand.js';
import { OpencodeSessionUpdateCommand } from '@poweragents/opencode/OpencodeSessionUpdateCommand.js';
import type { OpencodeSessionUpdateCommandParams } from '@poweragents/opencode/OpencodeSessionUpdateCommand.js';
import type { OpencodePermissionRule, OpencodeSession } from '@poweragents/opencode/OpencodeTypes.js';

import { ActiveProviderStore } from '../ai/ActiveProviderStore.js';
import { ChatgptSignInService } from '../chatgpt/ChatgptSignInService.js';
import { ClaudeSignInService } from '../claude/ClaudeSignInService.js';
import { PluginService } from '../plugins/PluginService.js';
import { ProjectService } from '../projects/ProjectService.js';
import { Sandbox } from '../sandbox/Sandbox.js';
import type { SandboxState } from '../sandbox/Sandbox.js';
import { ConversationService } from './ConversationService.js';

// OpenCode's commands are the boundary: they stand in for its HTTP API, in the shapes the commands return. Projects are
// real folders in a fresh temporary data root. The sign-in services stand in for the sandbox; the active provider's
// record sits above a scratch Lima home. Plugins are real too: the bundled ones of the plugins' fixtures (`gmail` at
// profile level, `email-sorting` at project level) and their own plugins (`my-notes` valid, `gmail` in conflict,
// `team-board` invalid) copied into the data root. The session's inbox is modelled: a prompt or synthetic input sent with
// `resume: false` waits there.

const PLUGIN_FIXTURES = path.join(import.meta.dirname, '..', 'plugins', 'fixtures');

/** What hides `email-sorting`, installed in another project, from a conversation. */
const EMAIL_SORTING_DENIED: OpencodePermissionRule[] = [
    { action: 'skill', resource: 'email-sorting:setup', effect: 'deny' },
    { action: 'skill', resource: 'email-sorting:sort', effect: 'deny' },
];

test("lists the project's conversations only, the most recently changed first, with whether each runs", async () => {
    const fixture = await setup();
    fixture.sessions.push(
        session('ses_old', fixture.dirA, { title: 'Stara', updatedAt: 10, providerId: 'claude-agent' }),
        session('ses_new', fixture.dirA, { updatedAt: 30, providerId: 'openai' }),
        session('ses_mid', fixture.dirA, { updatedAt: 15, providerId: 'anthropic' }),
        // OpenCode's directory filter failing must not leak another project's conversation.
        session('ses_other', fixture.dirB, { title: 'Cudza', updatedAt: 20 }),
    );
    fixture.active.add('ses_new');

    const conversations = await fixture.conversations.list(fixture.projectA.id);

    expect(fixture.listSessions).toHaveBeenCalledWith(fixture.dirA);
    const expected: Conversation[] = [
        { id: 'ses_new', updatedAt: 30, running: true, provider: 'chatgpt' },
        { id: 'ses_mid', updatedAt: 15, running: false },
        { id: 'ses_old', title: 'Stara', updatedAt: 10, running: false, provider: 'claude' },
    ];
    expect(conversations).toEqual(expected);
});

test("with no provider recorded and Claude connected, creates a conversation in the project's folder on Claude Sonnet", async () => {
    const fixture = await setup();
    fixture.providers.chatgpt = { connected: true };

    const conversation = await fixture.conversations.create(fixture.projectA.id);

    const params: OpencodeSessionCreateCommandParams = {
        directory: fixture.dirA,
        providerId: 'claude-agent',
        modelId: 'sonnet',
        permissions: [],
    };
    expect(fixture.createSession).toHaveBeenCalledWith(params);
    const expected: Conversation = { id: 'ses_created', updatedAt: 1, running: false, provider: 'claude' };
    expect(conversation).toEqual(expected);
});

test('with ChatGPT recorded and connected, creates a conversation on Terra', async () => {
    const fixture = await setup();
    fixture.providers.chatgpt = { connected: true };
    await fixture.activeProvider.set('chatgpt');

    const conversation = await fixture.conversations.create(fixture.projectA.id);

    const params: OpencodeSessionCreateCommandParams = {
        directory: fixture.dirA,
        providerId: 'openai',
        modelId: 'gpt-6.1-terra',
        permissions: [],
    };
    expect(fixture.createSession).toHaveBeenCalledWith(params);
    expect(conversation.provider).toBe('chatgpt');
});

test('with ChatGPT recorded but signed out, creates the conversation on ChatGPT, never on the connected Claude', async () => {
    const fixture = await setup();
    await fixture.activeProvider.set('chatgpt');

    await fixture.conversations.create(fixture.projectA.id);

    expect(fixture.createSession).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'openai' }));
});

test('with no provider recorded and none connected, refuses to create a conversation', async () => {
    const fixture = await setup();
    fixture.providers.claude = { connected: false };

    await expect(fixture.conversations.create(fixture.projectA.id)).rejects.toMatchObject({
        status: 409,
        payload: { error: 'AiNotConnected' },
    });
    expect(fixture.createSession).not.toHaveBeenCalled();
});

test("hides a project plugin's skills from the projects it is not installed in, never a profile plugin's", async () => {
    const fixture = await setup();
    await fixture.plugins.install({ name: 'gmail' });
    await fixture.plugins.install({ name: 'email-sorting', projectId: fixture.projectA.id });

    await fixture.conversations.create(fixture.projectB.id);
    await fixture.conversations.create(fixture.projectA.id);

    // Exact lists: a rule for `gmail` or the own `my-notes` would hide a profile plugin.
    expect(fixture.createSession.mock.calls.map(call => call[0].permissions)).toEqual([EMAIL_SORTING_DENIED, []]);
});

test('an open conversation gets the skills of the plugins installed now from its next message on', async () => {
    const fixture = await setup();
    fixture.sessions.push(session('ses_b', fixture.dirB));
    const ref = { projectId: fixture.projectB.id, conversationId: 'ses_b' };
    const order: string[] = [];
    fixture.updateSession.mockImplementation(params => {
        order.push(`update ${params.permissions.length}`);
        return Promise.resolve();
    });
    fixture.prompt.mockImplementation(params => {
        order.push(`prompt ${params.text}`);
        return Promise.resolve({ messageId: `msg_${params.text}`, admittedAt: 1 });
    });

    await fixture.conversations.send({ ...ref, text: 'Przed' });
    await fixture.plugins.install({ name: 'email-sorting', projectId: fixture.projectA.id });
    await fixture.conversations.send({ ...ref, text: 'Po instalacji' });
    await fixture.plugins.remove({ name: 'email-sorting', projectId: fixture.projectA.id });
    await fixture.conversations.send({ ...ref, text: 'Po usunięciu' });

    const expected: OpencodeSessionUpdateCommandParams[] = [
        { sessionId: 'ses_b', permissions: [] },
        { sessionId: 'ses_b', permissions: EMAIL_SORTING_DENIED },
        { sessionId: 'ses_b', permissions: [] },
    ];
    expect(fixture.updateSession.mock.calls.map(call => call[0])).toEqual(expected);
    // Set after the prompt, the rules would miss the run the message starts.
    expect(order).toEqual([
        'update 0',
        'prompt Przed',
        'update 2',
        'prompt Po instalacji',
        'update 0',
        'prompt Po usunięciu',
    ]);
});

test("creating a conversation syncs the plugins first, so an own plugin's edited skill is current in it", async () => {
    const fixture = await setup();
    await writeFile(
        path.join(fixture.dataRoot, 'plugins', 'my-notes', 'skills', 'take-note', 'SKILL.md'),
        '# Edited\n',
    );

    await fixture.conversations.create(fixture.projectA.id);

    const copy = path.join(fixture.dataRoot, '.poweragents', 'skills', 'my-notes:take-note', 'SKILL.md');
    expect(await readFile(copy, 'utf8')).toBe('# Edited\n');
});

test('a failed plugin sync does not block creating a conversation', async () => {
    const fixture = await setup();
    await fixture.plugins.install({ name: 'email-sorting', projectId: fixture.projectA.id });
    // The daemon's skills folder replaced by a file: the sync refuses to write through it.
    const skillsDir = path.join(fixture.dataRoot, '.poweragents', 'skills');
    await rm(skillsDir, { recursive: true });
    await writeFile(skillsDir, 'not a folder');

    const conversation = await fixture.conversations.create(fixture.projectB.id);

    expect(conversation.id).toBe('ses_created');
    expect(fixture.createSession).toHaveBeenCalledWith(expect.objectContaining({ permissions: EMAIL_SORTING_DENIED }));
    expect(fixture.logs.some(log => log.message === 'Plugins not synced before the conversation')).toBe(true);
});

test('reports a message sent while the agent works as queued, and one sent to an idle conversation as not', async () => {
    const fixture = await setup();
    fixture.sessions.push(session('ses_1', fixture.dirA));
    const ref = { projectId: fixture.projectA.id, conversationId: 'ses_1' };

    const idle = await fixture.conversations.send({ ...ref, text: 'Pierwsza' });
    fixture.active.add('ses_1');
    const busy = await fixture.conversations.send({ ...ref, text: 'Druga' });

    const expectedIdle: ConversationSendResult = { queued: false, messageId: 'msg_Pierwsza' };
    const expectedBusy: ConversationSendResult = { queued: true, messageId: 'msg_Druga' };
    expect(idle).toEqual(expectedIdle);
    expect(busy).toEqual(expectedBusy);
    const expected: OpencodeSessionPromptCommandParams = { sessionId: 'ses_1', text: 'Druga' };
    expect(fixture.prompt).toHaveBeenLastCalledWith(expected);
});

test.each([
    ['not installed anywhere, its own namesake in conflict', '/gmail:read-mail', 'gmail'],
    ['installed in another project only', '/email-sorting:sort', 'email-sorting'],
    ['own and invalid', '/team-board:board', 'team-board'],
    ['unknown', '/no-such-plugin:run', 'no-such-plugin'],
])(
    'a command of a plugin %s starts no run: the message and a note for the agent wait in the conversation',
    async (_case, text, plugin) => {
        const fixture = await setup();
        await fixture.plugins.install({ name: 'email-sorting', projectId: fixture.projectA.id });
        fixture.sessions.push(session('ses_b', fixture.dirB));
        const ref = { projectId: fixture.projectB.id, conversationId: 'ses_b' };

        const result = await fixture.conversations.send({ ...ref, text: `${text} z wczoraj` });

        const expected: ConversationSendResult = {
            queued: false,
            messageId: `msg_${text} z wczoraj`,
            stoppedBy: { plugin },
        };
        expect(result).toEqual(expected);
        // Only `resume: false` keeps an idle session idle: a prompt without it would start the run.
        const prompted: OpencodeSessionPromptCommandParams = {
            sessionId: 'ses_b',
            text: `${text} z wczoraj`,
            resume: false,
        };
        expect(fixture.prompt.mock.calls.map(call => call[0])).toEqual([prompted]);
        const note = fixture.synthetic.mock.calls[0]?.[0];
        expect(note).toMatchObject({ resume: false, metadata: { poweragents: 'pluginMissing', plugin } });
        expect(note?.text).toContain(`The command ${text} was not run`);

        const page = await fixture.conversations.listMessages(ref);
        const listed: ConversationMessagePage = {
            messages: [
                { type: 'user', id: `msg_${text} z wczoraj`, createdAt: 1, text: `${text} z wczoraj`, pending: true },
                { type: 'pluginMissing', id: 'syn_1', createdAt: 2, plugin },
            ],
        };
        expect(page).toEqual(listed);
    },
);

test("the person's next message is sent as any other, delivering the held message and the note before it", async () => {
    const fixture = await setup();
    fixture.sessions.push(session('ses_1', fixture.dirA));
    const ref = { projectId: fixture.projectA.id, conversationId: 'ses_1' };
    await fixture.conversations.send({ ...ref, text: '/gmail:read-mail' });
    const waiting = [...fixture.inbox];

    const result = await fixture.conversations.send({ ...ref, text: 'To zrób to inaczej' });

    const expected: ConversationSendResult = { queued: false, messageId: 'msg_To zrób to inaczej' };
    expect(result).toEqual(expected);
    const prompted: OpencodeSessionPromptCommandParams = { sessionId: 'ses_1', text: 'To zrób to inaczej' };
    expect(fixture.prompt).toHaveBeenLastCalledWith(prompted);
    // Still waiting when the run starts, so OpenCode gives the agent both, in order, with the new message.
    expect(fixture.inbox).toEqual(waiting);
    expect(waiting.map(item => item.type)).toEqual(['prompt', 'synthetic']);
});

test.each([
    ['installed in the profile', 'gmail', undefined, '/gmail:read-mail', ['gmail:read-mail']],
    ['installed in this project', 'email-sorting', 'A', '/email-sorting:sort', ['email-sorting:sort']],
    ['own', undefined, undefined, '/my-notes:take-note', ['my-notes:take-note']],
    ['installed, naming a skill it lacks', 'gmail', undefined, '/gmail:send-mail', undefined],
] as const)(
    'a command of a plugin %s goes out as typed, with its skill attached when it has it',
    async (_case, installed, project, text, skills) => {
        const fixture = await setup();
        if (installed) {
            await fixture.plugins.install({
                name: installed,
                projectId: project === 'A' ? fixture.projectA.id : undefined,
            });
        }
        fixture.sessions.push(session('ses_1', fixture.dirA));

        const result = await fixture.conversations.send({
            projectId: fixture.projectA.id,
            conversationId: 'ses_1',
            text: `${text} teraz`,
        });

        const expected: ConversationSendResult = { queued: false, messageId: `msg_${text} teraz` };
        expect(result).toEqual(expected);
        const prompted: OpencodeSessionPromptCommandParams = {
            sessionId: 'ses_1',
            text: `${text} teraz`,
            skills: skills && [...skills],
        };
        expect(fixture.prompt).toHaveBeenCalledWith(prompted);
        expect(fixture.synthetic).not.toHaveBeenCalled();
    },
);

test("stopping withdraws a held plugin command with its note, leaving OpenCode's own synthetic input", async () => {
    const fixture = await setup();
    fixture.sessions.push(session('ses_1', fixture.dirA));
    const ref = { projectId: fixture.projectA.id, conversationId: 'ses_1' };
    const openCodes: OpencodeInboxItem = { type: 'synthetic', id: 'syn_oc', createdAt: 1, text: 'Continue' };
    fixture.inbox.push(openCodes);
    await fixture.conversations.send({ ...ref, text: '/gmail:read-mail' });

    const result = await fixture.conversations.stop(ref);

    const expected: ConversationStopResult = {
        stopped: true,
        withdrawn: [{ id: 'msg_/gmail:read-mail', text: '/gmail:read-mail' }],
    };
    expect(result).toEqual(expected);
    expect(fixture.inbox).toEqual([openCodes]);
    const page = await fixture.conversations.listMessages(ref);
    expect(page.messages).toEqual([]);
});

test('hidden input refreshes the permissions, then starts a run on synthetic input the conversation never shows', async () => {
    const fixture = await setup();
    await fixture.plugins.install({ name: 'email-sorting', projectId: fixture.projectA.id });
    fixture.sessions.push(session('ses_b', fixture.dirB));
    const order: string[] = [];
    fixture.updateSession.mockImplementation(params => {
        order.push(`update ${params.permissions.length}`);
        return Promise.resolve();
    });
    fixture.synthetic.mockImplementation(params => {
        order.push(`synthetic ${params.text}`);
        return Promise.resolve();
    });

    await fixture.conversations.startHidden(
        { projectId: fixture.projectB.id, conversationId: 'ses_b' },
        'Przywitaj się',
    );

    expect(order).toEqual(['update 2', 'synthetic Przywitaj się']);
    const params: OpencodeSessionSyntheticCommandParams = { sessionId: 'ses_b', text: 'Przywitaj się' };
    expect(fixture.synthetic).toHaveBeenCalledWith(params);
});

test('stops a run after the interrupt, withdrawing the messages still waiting for the agent', async () => {
    const fixture = await setup();
    fixture.sessions.push(session('ses_1', fixture.dirA));
    fixture.inbox.push(waitingPrompt('msg_4', 'Dopisz czwarty punkt'), waitingPrompt('msg_5', 'I piąty'));
    const order: string[] = [];
    fixture.interrupt.mockImplementation(() => {
        order.push('interrupt');
        return Promise.resolve(true);
    });
    fixture.clearInbox.mockImplementation((sessionId, options) => {
        order.push('clearInbox');
        return fixture.takeInbox(sessionId, options);
    });

    const result = await fixture.conversations.stop({ projectId: fixture.projectA.id, conversationId: 'ses_1' });

    const expected: ConversationStopResult = {
        stopped: true,
        withdrawn: [
            { id: 'msg_4', text: 'Dopisz czwarty punkt' },
            { id: 'msg_5', text: 'I piąty' },
        ],
    };
    expect(result).toEqual(expected);
    expect(fixture.inbox).toEqual([]);
    // Cleared before the interrupt, a message could still be delivered in between and also given back.
    expect(order).toEqual(['interrupt', 'clearInbox']);
});

test.each(['send', 'startHidden', 'stop', 'listMessages'] as const)(
    '%s refuses a conversation of another project as not found, without touching it',
    async operation => {
        const fixture = await setup();
        fixture.sessions.push(session('ses_b', fixture.dirB));
        const ref = { projectId: fixture.projectA.id, conversationId: 'ses_b' };

        const call = {
            send: () => fixture.conversations.send({ ...ref, text: 'Cześć' }),
            startHidden: () => fixture.conversations.startHidden(ref, 'Cześć'),
            stop: () => fixture.conversations.stop(ref),
            listMessages: () => fixture.conversations.listMessages(ref),
        }[operation];

        await expect(call()).rejects.toMatchObject({ status: 404 });
        expect(fixture.prompt).not.toHaveBeenCalled();
        expect(fixture.synthetic).not.toHaveBeenCalled();
        expect(fixture.interrupt).not.toHaveBeenCalled();
        expect(fixture.clearInbox).not.toHaveBeenCalled();
        expect(fixture.listMessages).not.toHaveBeenCalled();
    },
);

test('refuses an unknown project as not found', async () => {
    const fixture = await setup();

    await expect(fixture.conversations.list('no-such-project')).rejects.toMatchObject({ status: 404 });
    expect(fixture.listSessions).not.toHaveBeenCalled();
});

test('maps a page of messages: steps by tool kind with targets within the project, errors by kind', async () => {
    const fixture = await setup();
    fixture.sessions.push(session('ses_1', fixture.dirA));
    // The waiting messages close the newest page only, never an older one.
    fixture.inbox.push(waitingPrompt('msg_9', 'Czekam'));
    fixture.setPage({
        olderCursor: 'cur_older',
        messages: [
            { type: 'prompt', id: 'msg_1', createdAt: 1, text: 'Utwórz plik test.md' },
            { type: 'other', id: 'msg_2', createdAt: 2 },
            {
                type: 'reply',
                id: 'msg_3',
                createdAt: 3,
                finish: 'tool-calls',
                parts: [
                    { type: 'text', text: 'Tworzę plik.' },
                    {
                        type: 'tool',
                        callId: 'call_1',
                        name: 'write',
                        status: 'completed',
                        input: { path: `${fixture.dirA}/notatki/test.md`, content: 'Zdanie.' },
                        output: [],
                    },
                    {
                        type: 'tool',
                        callId: 'call_2',
                        name: 'Bash',
                        status: 'failed',
                        input: { command: 'cat /etc/hosts' },
                        output: [],
                        error: { kind: 'ToolError', message: 'denied' },
                    },
                    { type: 'tool', callId: 'call_3', name: 'todowrite', status: 'pending', output: [] },
                ],
            },
            {
                type: 'reply',
                id: 'msg_4',
                createdAt: 4,
                parts: [],
                error: { kind: 'ProviderError', message: 'Not logged in · Please run /login', httpStatus: 401 },
            },
            {
                type: 'runEnd',
                id: 'msg_5',
                createdAt: 5,
                outcome: 'failed',
                error: {
                    kind: 'ProviderError',
                    message: 'Claude AI usage limit reached|1794600000',
                    responseBody: '{"secret":"echo"}',
                },
            },
        ],
    });

    const page = await fixture.conversations.listMessages({
        projectId: fixture.projectA.id,
        conversationId: 'ses_1',
        olderCursor: 'cur_page',
    });

    const params: OpencodeMessageListCommandParams = { sessionId: 'ses_1', olderCursor: 'cur_page', limit: 50 };
    expect(fixture.listMessages).toHaveBeenCalledWith(params);
    const expected: ConversationMessagePage = {
        olderCursor: 'cur_older',
        messages: [
            { type: 'user', id: 'msg_1', createdAt: 1, text: 'Utwórz plik test.md' },
            {
                type: 'agent',
                id: 'msg_3',
                createdAt: 3,
                parts: [
                    { type: 'text', text: 'Tworzę plik.' },
                    { type: 'step', id: 'call_1', kind: 'writeFile', target: 'notatki/test.md', status: 'done' },
                    {
                        type: 'step',
                        id: 'call_2',
                        kind: 'runCommand',
                        target: 'cat /etc/hosts',
                        status: 'failed',
                        error: 'denied',
                    },
                    { type: 'step', id: 'call_3', kind: 'other', status: 'running' },
                ],
            },
            { type: 'agent', id: 'msg_4', createdAt: 4, parts: [], error: { kind: 'signedOut' } },
            {
                type: 'runEnd',
                id: 'msg_5',
                createdAt: 5,
                outcome: 'failed',
                error: { kind: 'usageLimit', resetAt: 1_794_600_000_000 },
            },
        ],
    };
    expect(page).toEqual(expected);
});

async function setup() {
    const { container, logs } = createTestContainer();
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'poweragents-conversations-'));
    const dataRoot = path.join(tmp, 'root');
    await cp(path.join(PLUGIN_FIXTURES, 'own'), path.join(dataRoot, 'plugins'), { recursive: true });
    container.set(EnvVariables, {
        POWERAGENTS_DATA_ROOT: dataRoot,
        POWERAGENTS_LIMA_HOME: path.join(tmp, 'home', 'lima'),
        POWERAGENTS_PLUGINS_DIR: path.join(PLUGIN_FIXTURES, 'bundled'),
    });
    const state: SandboxState = {
        status: 'ready',
        endpoint: { url: 'http://127.0.0.1:1', username: 'opencode', password: 'pw' },
    };
    container.set(Sandbox, {
        getState: () => state,
        getVerifiedState: () => Promise.resolve(state),
        stateChanged: createEventEmitter<[state: SandboxState]>().event,
        start: () => Promise.resolve(state.endpoint),
        stop: () => Promise.resolve(),
        exec: () => {
            throw new Error('not used');
        },
        notifySkillsChanged: () => Promise.resolve(),
    });

    const providers: Providers = {
        claude: { connected: true, email: 'ola@example.com', plan: 'max', planAllowed: true },
        chatgpt: { connected: false },
    };
    container.set(ClaudeSignInService, {
        getStatus: () => Promise.resolve(providers.claude),
        startLogin: notUsed,
        completeLogin: notUsed,
        connectAgent: notUsed,
    });
    container.set(ChatgptSignInService, {
        getStatus: () => Promise.resolve(providers.chatgpt),
        startLogin: notUsed,
        getLoginState: notUsed,
        cancelLogin: notUsed,
    });

    const sessions: OpencodeSession[] = [];
    const active = new Set<string>();
    const inbox: OpencodeInboxItem[] = [];
    let page: OpencodeMessagePage = { messages: [] };
    const fixture = {
        sessions,
        active,
        setPage(next: OpencodeMessagePage) {
            page = next;
        },
        // Every session, whatever the directory: as if OpenCode's filter failed.
        listSessions: mock((_directory: string) => Promise.resolve([...sessions])),
        createSession: mock((params: OpencodeSessionCreateCommandParams) =>
            Promise.resolve(
                session('ses_created', params.directory, {
                    updatedAt: 1,
                    providerId: params.providerId,
                }),
            ),
        ),
        prompt: mock((params: OpencodeSessionPromptCommandParams): Promise<OpencodePromptReceipt> => {
            const messageId = `msg_${params.text}`;
            if (params.resume === false) {
                inbox.push(waitingPrompt(messageId, params.text));
            }
            return Promise.resolve({ messageId, admittedAt: 1 });
        }),
        synthetic: mock((params: OpencodeSessionSyntheticCommandParams) => {
            if (params.resume === false) {
                inbox.push({
                    type: 'synthetic',
                    id: `syn_${inbox.length}`,
                    createdAt: 2,
                    text: params.text,
                    metadata: params.metadata,
                });
            }
            return Promise.resolve();
        }),
        updateSession: mock((_params: OpencodeSessionUpdateCommandParams) => Promise.resolve()),
        interrupt: mock(() => Promise.resolve(true)),
        inbox,
        takeInbox,
        clearInbox: mock(takeInbox),
        listInbox: mock((_sessionId: string) => Promise.resolve([...inbox])),
        listMessages: mock((_params: OpencodeMessageListCommandParams) => Promise.resolve(page)),
    };
    container.set(OpencodeSessionListCommand, fixture.listSessions);
    container.set(OpencodeSessionGetCommand, id => Promise.resolve(sessions.find(item => item.id === id) ?? null));
    container.set(OpencodeSessionActiveListCommand, () => Promise.resolve(new Set(active)));
    container.set(OpencodeSessionCreateCommand, fixture.createSession);
    container.set(OpencodeSessionPromptCommand, fixture.prompt);
    container.set(OpencodeSessionUpdateCommand, fixture.updateSession);
    container.set(OpencodeSessionInterruptCommand, fixture.interrupt);
    container.set(OpencodeSessionSyntheticCommand, fixture.synthetic);
    container.set(OpencodeSessionInboxClearCommand, fixture.clearInbox);
    container.set(OpencodeSessionInboxListCommand, fixture.listInbox);
    container.set(OpencodeMessageListCommand, fixture.listMessages);

    const projects = container.resolve(ProjectService);
    const projectA = assertCreated(await projects.create('Alfa'));
    const projectB = assertCreated(await projects.create('Beta'));
    return {
        ...fixture,
        logs,
        dataRoot,
        plugins: container.resolve(PluginService),
        providers,
        activeProvider: container.resolve(ActiveProviderStore),
        conversations: container.resolve(ConversationService),
        projectA,
        projectB,
        dirA: '/Poweragents/projects/Alfa',
        dirB: '/Poweragents/projects/Beta',
    };

    /** What OpenCode's clear does: takes the prompts back, and the synthetic input whose metadata matches. */
    function takeInbox(_sessionId: string, options: OpencodeSessionInboxClearOptions = {}) {
        const prompts: OpencodeInboxPrompt[] = [];
        const kept: OpencodeInboxItem[] = [];
        const wanted = options.syntheticMetadata;
        for (const item of inbox) {
            const ours =
                item.type === 'synthetic' &&
                wanted !== undefined &&
                Object.entries(wanted).every(([key, value]) => item.metadata?.[key] === value);
            if (item.type === 'prompt') {
                prompts.push({ id: item.id, text: item.text });
            } else if (!ours) {
                kept.push(item);
            }
        }
        inbox.splice(0, inbox.length, ...kept);
        return Promise.resolve(prompts);
    }
}

/** What each provider's sign-in reports; a test changes it before the call. */
interface Providers {
    claude: ClaudeStatus;
    chatgpt: ChatgptStatus;
}

function notUsed(): Promise<never> {
    return Promise.reject(new Error('not used'));
}

function session(id: string, directory: string, fields: Partial<OpencodeSession> = {}): OpencodeSession {
    return { id, directory, createdAt: 1, updatedAt: 1, ...fields };
}

function waitingPrompt(id: string, text: string): OpencodeInboxItem {
    return { type: 'prompt', id, createdAt: 1, text };
}

function assertCreated(result: ProjectCreateResult): Project {
    if (!('created' in result)) {
        throw new Error('Project not created');
    }
    return result.created;
}
