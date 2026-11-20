import { expect, mock, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { assert } from '@nzyme/utils/assert.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';

import type { AppSetupStartInput, AppSetupStartResult } from '@piko/common/api/AppSetupTypes.js';
import type { ChatgptStatus } from '@piko/common/api/ChatgptTypes.js';
import type { ClaudeStatus } from '@piko/common/api/ClaudeTypes.js';
import { OpencodeSessionActiveListCommand } from '@piko/opencode/OpencodeSessionActiveListCommand.js';
import { OpencodeSessionCreateCommand } from '@piko/opencode/OpencodeSessionCreateCommand.js';
import type { OpencodeSessionCreateCommandParams } from '@piko/opencode/OpencodeSessionCreateCommand.js';
import { OpencodeSessionGetCommand } from '@piko/opencode/OpencodeSessionGetCommand.js';
import { OpencodeSessionListCommand } from '@piko/opencode/OpencodeSessionListCommand.js';
import { OpencodeSessionRenameCommand } from '@piko/opencode/OpencodeSessionRenameCommand.js';
import type { OpencodeSessionRenameCommandParams } from '@piko/opencode/OpencodeSessionRenameCommand.js';
import { OpencodeSessionSyntheticCommand } from '@piko/opencode/OpencodeSessionSyntheticCommand.js';
import type { OpencodeSessionSyntheticCommandParams } from '@piko/opencode/OpencodeSessionSyntheticCommand.js';
import { OpencodeSessionUpdateCommand } from '@piko/opencode/OpencodeSessionUpdateCommand.js';
import type { OpencodeSession } from '@piko/opencode/OpencodeTypes.js';

import { ActiveProviderStore } from '../ai/ActiveProviderStore.js';
import { ChatgptSignInService } from '../chatgpt/ChatgptSignInService.js';
import { ClaudeSignInService } from '../claude/ClaudeSignInService.js';
import { ProjectService } from '../projects/ProjectService.js';
import type { LocalProject } from '../projects/ProjectService.js';
import { Sandbox } from '../sandbox/Sandbox.js';
import type { SandboxState } from '../sandbox/Sandbox.js';
import { AppSetupService } from './AppSetupService.js';

// OpenCode's commands and the sign-in services are the boundary; projects are real folders in a fresh temporary data
// root, and the daemon's state and the active provider's record sit in a fresh folder above a scratch Lima home. No
// plugins: the bundled ones come from an empty folder.

const INPUT: AppSetupStartInput = { language: 'pl', conversationTitle: 'Poznajmy się' };

test('creates App setup once, starting its onboarding with hidden input, and never again once deleted', async () => {
    const fixture = await setup();

    const first = await fixture.appSetup.start(INPUT);

    const listed = await fixture.projects.list();
    const expectedProjects: LocalProject[] = [
        { id: listed[0]!.id, name: 'App setup', role: 'appSetup', dir: path.join(fixture.root, 'App setup') },
    ];
    expect(listed).toEqual(expectedProjects);
    const expectedFirst: AppSetupStartResult = {
        onboarding: { projectId: listed[0]!.id, conversationId: 'ses_onboarding' },
    };
    expect(first).toEqual(expectedFirst);
    const created: OpencodeSessionCreateCommandParams = {
        directory: '/Piko/projects/App setup',
        providerId: 'claude-agent',
        modelId: 'sonnet',
        permissions: [],
    };
    expect(fixture.createSession).toHaveBeenCalledWith(created);
    const renamed: OpencodeSessionRenameCommandParams = { sessionId: 'ses_onboarding', title: 'Poznajmy się' };
    expect(fixture.rename).toHaveBeenCalledWith(renamed);
    const opening = fixture.synthetic.mock.calls[0]?.[0];
    expect(opening?.sessionId).toBe('ses_onboarding');
    expect(opening?.text).toContain('onboarding skill');
    expect(opening?.text).toContain('greet them in Polish');

    // The person deletes App setup: it does not come back, and nothing else starts.
    await rm(path.join(fixture.root, 'App setup'), { recursive: true });
    const second = await fixture.appSetup.start(INPUT);

    const expectedSecond: AppSetupStartResult = { onboarding: null };
    expect(second).toEqual(expectedSecond);
    expect(await fixture.projects.list()).toEqual([]);
    expect(fixture.createSession).toHaveBeenCalledTimes(1);
    expect(fixture.synthetic).toHaveBeenCalledTimes(1);
});

test('with ChatGPT the active provider, the onboarding conversation runs on Terra', async () => {
    const fixture = await setup();
    fixture.providers.chatgpt = { connected: true };
    await fixture.activeProvider.set('chatgpt');

    const result = await fixture.appSetup.start(INPUT);

    expect(result.onboarding?.conversationId).toBe('ses_onboarding');
    const created: OpencodeSessionCreateCommandParams = {
        directory: '/Piko/projects/App setup',
        providerId: 'openai',
        modelId: 'gpt-6.1-terra',
        permissions: [],
    };
    expect(fixture.createSession).toHaveBeenCalledWith(created);
});

test('two starts at once make one App setup', async () => {
    const fixture = await setup();

    const results = await Promise.all([fixture.appSetup.start(INPUT), fixture.appSetup.start(INPUT)]);

    expect(results.filter(result => result.onboarding !== null)).toHaveLength(1);
    expect(await readdir(fixture.root)).toEqual(['App setup']);
});

test("never creates App setup through a projects' folder the agent replaced with a link, and tries again later", async () => {
    const fixture = await setup();
    const outside = path.join(fixture.tmp, 'outside');
    await mkdir(outside);
    await mkdir(path.dirname(fixture.root), { recursive: true });
    await symlink(outside, fixture.root);

    await expect(fixture.appSetup.start(INPUT)).rejects.toThrow("Projects' folder is not a folder");

    expect(await readdir(outside)).toEqual([]);
    expect(fixture.createSession).not.toHaveBeenCalled();
    // Nothing remembered: once the folder is a real one, App setup is created.
    await rm(fixture.root);
    const later = await fixture.appSetup.start(INPUT);
    expect(later.onboarding).not.toBeNull();
});

test('counts a project whose marker says App setup as App setup, whatever its name, and starts the onboarding in it', async () => {
    const fixture = await setup();
    const marked = await fixture.projects.create('Konfiguracja', 'appSetup');
    assert('created' in marked);

    const result = await fixture.appSetup.start(INPUT);

    const expected: AppSetupStartResult = {
        onboarding: { projectId: marked.created.id, conversationId: 'ses_onboarding' },
    };
    expect(result).toEqual(expected);
    expect(await readdir(fixture.root)).toEqual(['Konfiguracja']);
    // Remembered: deleting it later does not bring a new one.
    expect(await readFile(fixture.stateFile, 'utf8')).toContain('"appSetupCreatedAt"');
});

test('an opening input that failed is sent again by the next start, in the same conversation', async () => {
    const fixture = await setup();
    fixture.synthetic.mockImplementationOnce(() => Promise.reject(new Error('OpenCode is down')));

    const failed = await fixture.appSetup.start(INPUT);

    const expectedFailed: AppSetupStartResult = { onboarding: null };
    expect(failed).toEqual(expectedFailed);
    const projectId = (await fixture.projects.list())[0]!.id;

    const retried = await fixture.appSetup.start(INPUT);

    const expectedRetried: AppSetupStartResult = { onboarding: { projectId, conversationId: 'ses_onboarding' } };
    expect(retried).toEqual(expectedRetried);
    expect(fixture.createSession).toHaveBeenCalledTimes(1);
    expect(fixture.synthetic).toHaveBeenCalledTimes(2);
    expect(fixture.synthetic.mock.calls[1]?.[0].sessionId).toBe('ses_onboarding');
    // Started: never again.
    expect(await fixture.appSetup.start(INPUT)).toEqual({ onboarding: null });
    expect(fixture.synthetic).toHaveBeenCalledTimes(2);
});

test('an onboarding whose conversation is gone starts in a new one, but never beside the conversations of the person', async () => {
    const fixture = await setup();
    fixture.synthetic.mockImplementationOnce(() => Promise.reject(new Error('OpenCode is down')));
    await fixture.appSetup.start(INPUT);

    // The half-made conversation is gone: a new one replaces it.
    fixture.sessions.length = 0;
    fixture.synthetic.mockImplementationOnce(() => Promise.reject(new Error('OpenCode is down')));
    await fixture.appSetup.start(INPUT);
    expect(fixture.createSession).toHaveBeenCalledTimes(2);
    expect(fixture.sessions).toHaveLength(1);

    // The person talks in App setup in a conversation of their own: no onboarding beside it.
    fixture.sessions[0]!.id = 'ses_person';
    const result = await fixture.appSetup.start(INPUT);

    const expected: AppSetupStartResult = { onboarding: null };
    expect(result).toEqual(expected);
    expect(fixture.createSession).toHaveBeenCalledTimes(2);
    expect(fixture.synthetic.mock.calls.map(call => call[0].sessionId)).toEqual(['ses_onboarding', 'ses_onboarding']);
});

async function setup() {
    const { container } = createTestContainer();
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'piko-app-setup-'));
    await mkdir(path.join(tmp, 'bundled'));
    container.set(EnvVariables, {
        PIKO_DATA_ROOT: path.join(tmp, 'root'),
        PIKO_LIMA_HOME: path.join(tmp, 'home', 'lima'),
        PIKO_PLUGINS_DIR: path.join(tmp, 'bundled'),
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
    const createSession = mock((params: OpencodeSessionCreateCommandParams) => {
        const session: OpencodeSession = {
            id: 'ses_onboarding',
            directory: params.directory,
            createdAt: 1,
            updatedAt: 1,
        };
        sessions.push(session);
        return Promise.resolve(session);
    });
    const rename = mock((_params: OpencodeSessionRenameCommandParams) => Promise.resolve());
    const synthetic = mock((_params: OpencodeSessionSyntheticCommandParams) => Promise.resolve());
    container.set(OpencodeSessionCreateCommand, createSession);
    container.set(OpencodeSessionListCommand, directory =>
        Promise.resolve(sessions.filter(session => session.directory === directory)),
    );
    container.set(OpencodeSessionGetCommand, id =>
        Promise.resolve(sessions.find(session => session.id === id) ?? null),
    );
    container.set(OpencodeSessionUpdateCommand, () => Promise.resolve());
    container.set(OpencodeSessionActiveListCommand, () => Promise.resolve(new Set<string>()));
    container.set(OpencodeSessionRenameCommand, rename);
    container.set(OpencodeSessionSyntheticCommand, synthetic);

    return {
        tmp,
        root: path.join(tmp, 'root', 'projects'),
        stateFile: path.join(tmp, 'home', 'state.json'),
        projects: container.resolve(ProjectService),
        providers,
        activeProvider: container.resolve(ActiveProviderStore),
        appSetup: container.resolve(AppSetupService),
        sessions,
        createSession,
        rename,
        synthetic,
    };
}

/** What each provider's sign-in reports; a test changes it before the call. */
interface Providers {
    claude: ClaudeStatus;
    chatgpt: ChatgptStatus;
}

function notUsed(): Promise<never> {
    return Promise.reject(new Error('not used'));
}
