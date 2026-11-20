import { expect, mock, test } from 'bun:test';
import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import type { HttpRequest } from '@nzyme/rpc/types/HttpRequest.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';

import type { ClaudeStatus } from '@piko/common/api/ClaudeTypes.js';
import type { PluginInstall, PluginInstallInput, PluginInstallOutcome } from '@piko/common/api/PluginTypes.js';
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

import { ChatgptSignInService } from '../chatgpt/ChatgptSignInService.js';
import { ClaudeSignInService } from '../claude/ClaudeSignInService.js';
import { PluginService } from '../plugins/PluginService.js';
import { ProjectService } from '../projects/ProjectService.js';
import { Sandbox } from '../sandbox/Sandbox.js';
import type { SandboxState } from '../sandbox/Sandbox.js';
import { PluginInstallEndpointHandler } from './PluginInstallEndpoint.handler.js';

// OpenCode's commands, the sign-in services and the sandbox are the boundary; the plugins are the fixtures (bundled
// `gmail`: profile, onboarding `connect`; `email-sorting`: project, onboarding `setup`; own `my-notes`: profile, no
// onboarding), installed for real in a fresh data root with real project folders.

const FIXTURES = path.join(import.meta.dirname, '../plugins/fixtures');

test('installing a profile plugin starts its onboarding in the given project, hidden; installing it again starts it again', async () => {
    const fixture = await setup();
    const projectId = await fixture.createProject('Praca');

    const first = await fixture.install({ name: 'gmail', projectId, language: 'pl', conversationTitle: 'Gmail' });

    const expectedFirst: PluginInstallOutcome = {
        conversation: { projectId, conversationId: 'ses_1' },
        onboardingError: null,
        environmentError: null,
    };
    expect(first).toEqual(expectedFirst);
    expect(await fixture.installsOf('gmail')).toEqual([{ profile: true }]);
    expect(fixture.createSession.mock.calls[0]?.[0].directory).toBe('/Piko/projects/Praca');
    const renamed: OpencodeSessionRenameCommandParams = { sessionId: 'ses_1', title: 'Gmail' };
    expect(fixture.rename).toHaveBeenCalledWith(renamed);
    const opening = fixture.synthetic.mock.calls[0]?.[0];
    expect(opening?.sessionId).toBe('ses_1');
    expect(opening?.text).toContain('Load the skill gmail:connect');
    expect(opening?.text).toContain('speak to them in Polish');

    // From the plugin's page again, without a title: a new onboarding, OpenCode's title kept.
    const second = await fixture.install({ name: 'gmail', projectId, language: 'en' });

    expect(second.conversation).toEqual({ projectId, conversationId: 'ses_2' });
    expect(fixture.rename).toHaveBeenCalledTimes(1);
    expect(fixture.synthetic.mock.calls[1]?.[0].sessionId).toBe('ses_2');
    expect(fixture.synthetic.mock.calls[1]?.[0].text).toContain('speak to them in English');
    expect(await fixture.installsOf('gmail')).toEqual([{ profile: true }]);
});

test('installing a project plugin installs it in the project and starts its onboarding there', async () => {
    const fixture = await setup();
    const projectId = await fixture.createProject('Poczta');

    const result = await fixture.install({ name: 'email-sorting', projectId, language: 'en' });

    expect(result.conversation).toEqual({ projectId, conversationId: 'ses_1' });
    expect(await fixture.installsOf('email-sorting')).toEqual([{ projectId }]);
    expect(fixture.createSession.mock.calls[0]?.[0].directory).toBe('/Piko/projects/Poczta');
    expect(fixture.synthetic.mock.calls[0]?.[0].text).toContain('Load the skill email-sorting:setup');
});

test('a plugin without an onboarding skill is installed in the profile, its project ignored, and no conversation starts', async () => {
    const fixture = await setup();
    const projectId = await fixture.createProject('Praca');

    const result = await fixture.install({ name: 'my-notes', projectId, language: 'pl' });

    const expected: PluginInstallOutcome = { conversation: null, onboardingError: null, environmentError: null };
    expect(result).toEqual(expected);
    expect(fixture.createSession).not.toHaveBeenCalled();
    expect(fixture.synthetic).not.toHaveBeenCalled();
});

test.each([
    ['a profile plugin with an onboarding skill and no project', 'gmail', undefined, 400, 'ProjectRequired'],
    ['a profile plugin with an onboarding skill and an unknown project', 'gmail', 'brak', 404, 'ProjectNotFound'],
    ['a project plugin without a project', 'email-sorting', undefined, 400, 'PluginLevelMismatch'],
    ['a project plugin in an unknown project', 'email-sorting', 'brak', 404, 'ProjectNotFound'],
    ['an unknown plugin', 'brak', undefined, 404, 'PluginNotFound'],
])('refuses %s, installing nothing', async (_case, name, projectId, status, error) => {
    const fixture = await setup();

    const input: PluginInstallInput =
        projectId === undefined ? { name, language: 'pl' } : { name, projectId, language: 'pl' };
    await expect(fixture.install(input)).rejects.toMatchObject({ status, payload: { error } });

    expect(await fixture.installsOf(name)).toEqual([]);
    expect(fixture.createSession).not.toHaveBeenCalled();
});

test.each([
    ['no AI is connected', { ai: false }, { code: 'aiNotConnected' }],
    ['the sandbox is not ready', { ready: false }, { code: 'sandboxNotReady' }],
    ['the agent fails', { createFails: true }, { code: 'failed' }],
] as const)(
    'when %s the plugin stays installed and the onboarding error says why',
    async (_case, options: SetupOptions, onboardingError) => {
        const fixture = await setup(options);
        const projectId = await fixture.createProject('Praca');

        const result = await fixture.install({ name: 'gmail', projectId, language: 'pl' });

        const expected: PluginInstallOutcome = { conversation: null, onboardingError, environmentError: null };
        expect(result).toEqual(expected);
        expect(await fixture.installsOf('gmail')).toEqual([{ profile: true }]);
        expect(fixture.synthetic).not.toHaveBeenCalled();
    },
);

interface SetupOptions {
    /** Claude is connected on an allowed plan; on by default. */
    ai?: boolean;
    /** The sandbox is ready; on by default. */
    ready?: boolean;
    /** OpenCode fails to create a session. */
    createFails?: boolean;
}

async function setup(options: SetupOptions = {}) {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'piko-plugin-install-'));
    const dataRoot = path.join(tmp, 'root');
    await cp(path.join(FIXTURES, 'own'), path.join(dataRoot, 'plugins'), { recursive: true });
    const { container } = createTestContainer();
    container.set(EnvVariables, {
        PIKO_DATA_ROOT: dataRoot,
        PIKO_LIMA_HOME: path.join(tmp, 'home', 'lima'),
        PIKO_PLUGINS_DIR: path.join(FIXTURES, 'bundled'),
    });
    const state: SandboxState =
        options.ready === false
            ? { status: 'stopped' }
            : { status: 'ready', endpoint: { url: 'http://127.0.0.1:1', username: 'opencode', password: 'pw' } };
    container.set(Sandbox, {
        getState: () => state,
        getVerifiedState: () => Promise.resolve(state),
        stateChanged: createEventEmitter<[state: SandboxState]>().event,
        start: notUsed,
        stop: () => Promise.resolve(),
        // Applying a plugin's environment runs commands in the container: each succeeds.
        exec: () => ({
            stdin: { write: () => undefined, end: () => undefined },
            stdout: new Blob([]).stream(),
            stderr: new Blob([]).stream(),
            exited: Promise.resolve(0),
            kill: () => undefined,
        }),
        notifySkillsChanged: () => Promise.resolve(),
    });
    const claude: ClaudeStatus =
        options.ai === false
            ? { connected: false }
            : { connected: true, email: 'ola@example.com', plan: 'max', planAllowed: true };
    container.set(ClaudeSignInService, {
        getStatus: () => Promise.resolve(claude),
        startLogin: notUsed,
        completeLogin: notUsed,
        connectAgent: notUsed,
    });
    container.set(ChatgptSignInService, {
        getStatus: () => Promise.resolve({ connected: false }),
        startLogin: notUsed,
        getLoginState: notUsed,
        cancelLogin: notUsed,
    });
    const sessions: OpencodeSession[] = [];
    const createSession = mock((params: OpencodeSessionCreateCommandParams) => {
        if (options.createFails) {
            return Promise.reject(new Error('OpenCode answered 500'));
        }
        const session: OpencodeSession = {
            id: `ses_${sessions.length + 1}`,
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

    const handler = container.resolve(PluginInstallEndpointHandler);
    const request: HttpRequest = {
        method: 'POST',
        path: '/api/plugins/install',
        headers: {},
        body: '',
        ip: '127.0.0.1',
    };
    const projects = container.resolve(ProjectService);
    const plugins = container.resolve(PluginService);
    return {
        install: (input: PluginInstallInput) => handler(input, { request }),
        createSession,
        rename,
        synthetic,
        async createProject(name: string) {
            const result = await projects.create(name);
            if (!('created' in result)) {
                throw new Error('Project not created');
            }
            return result.created.id;
        },
        async installsOf(name: string): Promise<PluginInstall[]> {
            return (await plugins.list()).find(plugin => plugin.name === name)?.installs ?? [];
        },
    };
}

function notUsed(): Promise<never> {
    return Promise.reject(new Error('not used'));
}
