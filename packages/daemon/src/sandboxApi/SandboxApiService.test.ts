import { afterEach, expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';

import type { PluginInstalledEvent } from '@piko/common/api/DaemonEventTypes.js';
import type { PluginInstall } from '@piko/common/api/PluginTypes.js';
import { OpencodeSessionGetCommand } from '@piko/opencode/OpencodeSessionGetCommand.js';
import type { OpencodeSession } from '@piko/opencode/OpencodeTypes.js';

import { toAgentDir } from '../conversations/utils/toAgentDir.js';
import { PluginService } from '../plugins/PluginService.js';
import type { PluginServiceShape } from '../plugins/PluginService.js';
import { ProjectService } from '../projects/ProjectService.js';
import { Sandbox } from '../sandbox/Sandbox.js';
import type { SandboxState } from '../sandbox/Sandbox.js';
import { SandboxApiService } from './SandboxApiService.js';
import type { SandboxPlugin, SandboxPluginInstallResult } from './SandboxApiService.js';

// A real server on a free port, called with real requests; real plugins from `../plugins/fixtures` (bundled `gmail`,
// profile level with the onboarding skill `connect`; bundled `email-sorting`, project level with `setup`; own `my-notes`)
// in a fresh data root. OpenCode is the boundary: its sessions are a fixed list.

const FIXTURES = path.join(import.meta.dirname, '../plugins/fixtures');
const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';
const CLI = path.join(import.meta.dirname, '../../sandbox/piko.js');

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
    for (const cleanup of cleanups.splice(0).toReversed()) {
        await cleanup();
    }
});

test('without the right token every request gets 401, whatever it asks for, and changes nothing', async () => {
    const { call, plugins } = await setup();
    const tokens = [undefined, `Bearer ${TOKEN.replace('a', 'b')}`, `Bearer ${TOKEN}x`, TOKEN, `Basic ${TOKEN}`];
    const requests: [string, string][] = [
        ['GET', '/plugins'],
        ['POST', '/plugins/install'],
        ['POST', '/plugins/remove'],
        ['DELETE', '/plugins'],
        ['GET', '/elsewhere'],
    ];

    for (const authorization of tokens) {
        for (const [method, route] of requests) {
            const response = await call(method, route, { authorization, body: { name: 'gmail' } });
            expect({ authorization, method, route, status: response.status }).toEqual({
                authorization,
                method,
                route,
                status: 401,
            });
            expect(await response.text()).not.toContain('gmail');
        }
    }
    expect(await installsOf(plugins, 'gmail')).toEqual([]);
});

test('without a session in a project nothing is listed, installed or removed', async () => {
    const { call, plugins } = await setup();
    // `gmail` is installed in the profile and `email-sorting` nowhere, so a remove or an install that slipped past the
    // refusal would show in the installs.
    await plugins.install({ name: 'gmail' });

    const cases: [string | undefined, number, string][] = [
        [undefined, 400, 'SessionMissing'],
        ['ses_unknown', 404, 'ConversationNotFound'],
        // The Memory folder, and a project folder whose marker is gone: neither is a project.
        ['ses_memory', 403, 'ConversationNotInProject'],
        ['ses_gone', 403, 'ConversationNotInProject'],
    ];
    for (const [sessionId, status, error] of cases) {
        for (const [method, route, name] of [
            ['GET', '/plugins', 'gmail'],
            ['POST', '/plugins/install', 'email-sorting'],
            ['POST', '/plugins/remove', 'gmail'],
        ] as const) {
            const response = await call(method, route, { session: sessionId, body: { name } });
            expect({ sessionId, route, refusal: await readRefusal(response) }).toEqual({
                sessionId,
                route,
                refusal: [status, error],
            });
        }
    }
    const expectedInstalls: PluginInstall[] = [{ profile: true }];
    expect(await installsOf(plugins, 'gmail')).toEqual(expectedInstalls);
    expect(await installsOf(plugins, 'email-sorting')).toEqual([]);
});

test("an installation by the agent goes into the conversation's project and emits pluginInstalled, also when repeated", async () => {
    const { call, plugins, events, projectId } = await setup();

    const first = await call('POST', '/plugins/install', { body: { name: 'email-sorting' } });
    const again = await call('POST', '/plugins/install', { body: { name: 'email-sorting' } });
    const own = await call('POST', '/plugins/install', { body: { name: 'my-notes' } });

    expect(first.status).toBe(200);
    const expected: SandboxPluginInstallResult = {
        plugin: 'email-sorting',
        source: 'bundled',
        level: 'project',
        projectName: 'Praca',
        added: true,
        onboardingSkill: 'email-sorting:setup',
    };
    expect(await first.json()).toEqual(expected);
    expect(await again.json()).toEqual({ ...expected, added: false });
    expect(await own.json()).toEqual({ plugin: 'my-notes', source: 'own', level: 'profile', added: false });
    const expectedInstalls: PluginInstall[] = [{ projectId }];
    expect(await installsOf(plugins, 'email-sorting')).toEqual(expectedInstalls);
    const expectedEvents: PluginInstalledEvent[] = [
        { type: 'pluginInstalled', plugin: 'email-sorting', projectId, conversationId: 'ses_work' },
        { type: 'pluginInstalled', plugin: 'email-sorting', projectId, conversationId: 'ses_work' },
        { type: 'pluginInstalled', plugin: 'my-notes', projectId, conversationId: 'ses_work' },
    ];
    expect(events).toEqual(expectedEvents);
});

test('a profile plugin goes into the profile, and its onboarding skill comes back to load', async () => {
    const { call, plugins } = await setup();

    const response = await call('POST', '/plugins/install', { body: { name: 'gmail' } });

    const expected: SandboxPluginInstallResult = {
        plugin: 'gmail',
        source: 'bundled',
        level: 'profile',
        added: true,
        onboardingSkill: 'gmail:connect',
    };
    expect(await response.json()).toEqual(expected);
    const expectedInstalls: PluginInstall[] = [{ profile: true }];
    expect(await installsOf(plugins, 'gmail')).toEqual(expectedInstalls);
});

test('lists what the agent has in the conversation and what it can install', async () => {
    const { call, plugins, otherProjectId } = await setup();
    await plugins.install({ name: 'email-sorting', projectId: otherProjectId });

    const response = await call('GET', '/plugins');

    const expected: SandboxPlugin = {
        name: 'email-sorting',
        source: 'bundled',
        level: 'project',
        title: 'email-sorting',
        description: 'Describes email-sorting.',
        // Installed in the other project only.
        installed: false,
    };
    expect(await response.json()).toEqual(
        expect.arrayContaining([
            expected,
            expect.objectContaining({ name: 'my-notes', source: 'own', installed: true }),
            expect.objectContaining({ name: 'old-name', installed: false, errors: [{ code: 'nameMismatch' }] }),
        ]),
    );
});

test("removes a project plugin from the conversation's project only, and refuses an own plugin", async () => {
    const { call, plugins, projectId, otherProjectId } = await setup();
    await plugins.install({ name: 'email-sorting', projectId });
    await plugins.install({ name: 'email-sorting', projectId: otherProjectId });

    const removed = await call('POST', '/plugins/remove', { body: { name: 'email-sorting' } });
    const own = await call('POST', '/plugins/remove', { body: { name: 'my-notes' } });

    expect(await removed.json()).toEqual({ plugin: 'email-sorting', level: 'project', projectName: 'Praca' });
    const expectedInstalls: PluginInstall[] = [{ projectId: otherProjectId }];
    expect(await installsOf(plugins, 'email-sorting')).toEqual(expectedInstalls);
    const ownBody = await own.text();
    expect([own.status, JSON.parse(ownBody)]).toMatchObject([409, { error: 'OwnPluginNotRemovable' }]);
    expect(ownBody).toContain('/Piko/plugins/my-notes');
});

test("passes PluginService's errors through, and refuses other routes, methods and bodies", async () => {
    const { call } = await setup();

    expect(await readRefusal(await call('POST', '/plugins/install', { body: { name: 'nope' } }))).toEqual([
        404,
        'PluginNotFound',
    ]);
    expect(await readRefusal(await call('POST', '/plugins/remove', { body: { name: 'gmail' } }))).toEqual([
        404,
        'PluginNotInstalled',
    ]);
    expect(await readRefusal(await call('POST', '/plugins/install', { body: { name: '../gmail' } }))).toEqual([
        400,
        'InvalidBody',
    ]);
    expect(await readRefusal(await call('POST', '/plugins/install', { body: { name: 'x'.repeat(5000) } }))).toEqual([
        413,
        'BodyTooLarge',
    ]);
    expect(await readRefusal(await call('GET', '/elsewhere'))).toEqual([404, 'NotFound']);
    const wrongMethod = await call('GET', '/plugins/install');
    expect([wrongMethod.status, wrongMethod.headers.get('allow')]).toEqual([405, 'POST']);
    expect(await readRefusal(await call('GET', '/plugins', { origin: 'https://evil.example' }))).toEqual([
        403,
        'Forbidden',
    ]);
});

test('the piko command installs through the API and tells the agent what to do next', async () => {
    const { port } = await setup();

    const result = await runCli(['plugin', 'install', 'gmail'], {
        PIKO_DAEMON_URL: `http://127.0.0.1:${port}`,
        PIKO_BROWSER_TOKEN: TOKEN,
        OPENCODE_SESSION_ID: 'ses_work',
    });

    expect(result).toEqual({
        exitCode: 0,
        stdout:
            'Installed gmail in the profile.\nTell the person you installed it.\n' +
            'Now load the skill gmail:connect and follow it in this conversation.\n',
        stderr: '',
    });
});

test("the piko command fails clearly outside the agent's shell and on a refusal", async () => {
    const { port } = await setup();

    const missing = await runCli(['plugin', 'list'], { PIKO_DAEMON_URL: `http://127.0.0.1:${port}` });
    const refused = await runCli(['plugin', 'install', 'nope'], {
        PIKO_DAEMON_URL: `http://127.0.0.1:${port}`,
        PIKO_BROWSER_TOKEN: TOKEN,
        OPENCODE_SESSION_ID: 'ses_work',
    });

    expect(missing).toEqual({
        exitCode: 1,
        stdout: '',
        stderr: "piko: PIKO_BROWSER_TOKEN, OPENCODE_SESSION_ID not set; the command works only from the agent's own shell.\n",
    });
    expect(refused).toEqual({ exitCode: 1, stdout: '', stderr: 'piko: No plugin with this name\n' });
});

/** Options of a request made by `call`. */
interface CallOptions {
    /** `Authorization`; the right bearer token when not given, none when `undefined` is given. */
    authorization?: string;
    /** `X-Opencode-Session`; `ses_work`, a conversation in Praca, when not given, none when `undefined` is given. */
    session?: string;
    body?: object;
    origin?: string;
}

async function setup() {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'pa-sandbox-api-'));
    cleanups.push(() => rm(tmp, { recursive: true, force: true }));
    const stateFolder = path.join(tmp, 'state');
    await mkdir(stateFolder);
    await writeFile(path.join(stateFolder, 'browser-token'), TOKEN);
    const dataRoot = path.join(tmp, 'root');
    await cp(path.join(FIXTURES, 'own'), path.join(dataRoot, 'plugins'), { recursive: true });

    const { container } = createTestContainer();
    container.set(EnvVariables, {
        PIKO_DATA_ROOT: dataRoot,
        PIKO_PLUGINS_DIR: path.join(FIXTURES, 'bundled'),
        PIKO_LIMA_HOME: path.join(stateFolder, 'lima'),
    });
    const state: SandboxState = { status: 'stopped' };
    container.set(Sandbox, {
        getState: () => state,
        getVerifiedState: () => Promise.resolve(state),
        stateChanged: createEventEmitter<[state: SandboxState]>().event,
        start: () => Promise.reject(new Error('not used')),
        stop: () => Promise.resolve(),
        exec: () => {
            throw new Error('not used');
        },
        notifySkillsChanged: () => Promise.resolve(),
    });
    const projects = container.resolve(ProjectService);
    const work = await createProject('Praca');
    const other = await createProject('Dom');
    const gone = await createProject('Stary');
    await rm(path.join(gone.dir, '.project.json'));
    const sessions: OpencodeSession[] = [
        fakeSession('ses_work', toAgentDir(work.dir)),
        fakeSession('ses_memory', '/Piko/memory'),
        fakeSession('ses_gone', toAgentDir(gone.dir)),
    ];
    container.set(OpencodeSessionGetCommand, id => Promise.resolve(sessions.find(item => item.id === id) ?? null));

    const api = container.resolve(SandboxApiService);
    const events: PluginInstalledEvent[] = [];
    api.pluginInstalled.on(event => events.push(event));
    const server = api.listen(0);
    cleanups.push(() => server.close());

    return {
        port: server.port,
        plugins: container.resolve(PluginService),
        events,
        projectId: work.id,
        otherProjectId: other.id,
        call,
    };

    function call(method: string, route: string, options: CallOptions = {}) {
        const headers: Record<string, string> = {};
        const authorization = 'authorization' in options ? options.authorization : `Bearer ${TOKEN}`;
        if (authorization !== undefined) {
            headers.authorization = authorization;
        }
        const sessionId = 'session' in options ? options.session : 'ses_work';
        if (sessionId !== undefined) {
            headers['x-opencode-session'] = sessionId;
        }
        if (options.origin !== undefined) {
            headers.origin = options.origin;
        }
        return fetch(`http://127.0.0.1:${server.port}${route}`, {
            method,
            headers,
            body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
        });
    }

    async function createProject(name: string) {
        const result = await projects.create(name);
        if (!('created' in result)) {
            throw new Error('Project not created');
        }
        const project = await projects.get(result.created.id);
        return { id: result.created.id, dir: project!.dir };
    }
}

/** A refusal's status and error code. */
async function readRefusal(response: Response) {
    const body: unknown = await response.json();
    return [response.status, typeof body === 'object' && body !== null && 'error' in body ? body.error : null];
}

function fakeSession(id: string, directory: string): OpencodeSession {
    return { id, directory, createdAt: 0, updatedAt: 0 };
}

async function installsOf(plugins: PluginServiceShape, name: string) {
    const plugin = (await plugins.list()).find(item => item.name === name);
    return plugin?.installs ?? [];
}

/** Runs the `piko` command as the agent's shell does, with only `env` set besides `PATH`. */
async function runCli(args: string[], env: Record<string, string>) {
    const child = Bun.spawn(['bun', CLI, ...args], {
        env: { PATH: process.env.PATH ?? '', ...env },
        stdout: 'pipe',
        stderr: 'pipe',
    });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);
    return { exitCode, stdout, stderr };
}
