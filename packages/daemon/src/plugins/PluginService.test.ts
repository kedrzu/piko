import { expect, test } from 'bun:test';
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { HttpError } from '@nzyme/fetch-utils/HttpError.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';

import type { PluginsChangedEvent } from '@poweragents/common/api/DaemonEventTypes.js';
import type { PluginInstall } from '@poweragents/common/api/PluginTypes.js';

import { ProjectService } from '../projects/ProjectService.js';
import type { ProjectServiceShape } from '../projects/ProjectService.js';
import { Sandbox, SKILLS_SYNC_FILE } from '../sandbox/Sandbox.js';
import type { SandboxState } from '../sandbox/Sandbox.js';
import { PluginService } from './PluginService.js';
import type { PluginServiceShape } from './PluginService.js';

// The filesystem is the boundary: each test gets its own data root in a fresh temporary folder, with the own plugins
// of `fixtures/own` and the bundled ones read from `fixtures/bundled`. Valid there: bundled `gmail` (profile level) and
// `email-sorting` (project level), own `my-notes`; the other own plugins have errors. The sandbox is a fake that counts
// how often it was told the skills changed.

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

test('installs a bundled plugin: a manifest entry, a copy of the plugin and its prefixed skills beside the own ones', async () => {
    const { plugins, daemonDir, events } = await setup();

    expect(await installsOf(plugins, 'gmail')).toEqual([]);
    const result = await plugins.install({ name: 'gmail' });

    expect(result.added).toBe(true);
    expect(JSON.parse(await readFile(path.join(daemonDir, 'plugins.json'), 'utf8'))).toEqual({
        installed: [{ name: 'gmail' }],
    });
    expect(await readdir(path.join(daemonDir, 'plugins'))).toEqual(['gmail']);
    expect(await readFile(path.join(daemonDir, 'plugins', 'gmail', 'plugin.json'), 'utf8')).toBe(
        await readFile(path.join(FIXTURES, 'bundled', 'gmail', 'plugin.json'), 'utf8'),
    );
    // The conflicting own `gmail`, the misnamed and the project-level own plugins are not copied.
    expect((await readdir(path.join(daemonDir, 'skills'))).toSorted()).toEqual([
        'gmail:connect',
        'gmail:read-mail',
        'my-notes:take-note',
    ]);
    expect(await readFile(path.join(daemonDir, 'skills', 'gmail:connect', 'SKILL.md'), 'utf8')).toBe(
        await readFile(path.join(FIXTURES, 'bundled', 'gmail', 'skills', 'connect', 'SKILL.md'), 'utf8'),
    );
    expect(await installsOf(plugins, 'gmail')).toEqual([{ profile: true }]);
    expect(await installsOf(plugins, 'my-notes')).toEqual([{ profile: true }]);
    expect(events).toEqual([{ type: 'pluginsChanged' }]);
});

test('installs a project plugin once per project; installing it again changes nothing', async () => {
    const { plugins, projects, events } = await setup();
    const first = await createProject(projects, 'Praca');
    const second = await createProject(projects, 'Dom');

    await plugins.install({ name: 'email-sorting', projectId: first });
    await plugins.install({ name: 'email-sorting', projectId: second });
    const again = await plugins.install({ name: 'email-sorting', projectId: first });

    expect(again.added).toBe(false);
    expect(await installsOf(plugins, 'email-sorting')).toEqual([{ projectId: first }, { projectId: second }]);
    expect(events).toHaveLength(2);
});

test.each([
    ['a profile plugin in a project', 'gmail', 'project', 'PluginLevelMismatch'],
    ['a project plugin in the profile', 'email-sorting', undefined, 'PluginLevelMismatch'],
    ['a project plugin in an unknown project', 'email-sorting', 'unknown', 'ProjectNotFound'],
    ['an unknown plugin', 'calendar', undefined, 'PluginNotFound'],
    ['an own plugin with errors', 'team-board', undefined, 'PluginInvalid'],
])('refuses to install %s and leaves the manifest untouched', async (_case, name, project, code) => {
    const { plugins, projects, daemonDir, events } = await setup();
    const projectId = project === 'project' ? await createProject(projects, 'Praca') : project;
    await plugins.install({ name: 'my-notes' });
    await plugins.install({ name: 'email-sorting', projectId: await createProject(projects, 'Dom') });
    const manifest = await readFile(path.join(daemonDir, 'plugins.json'), 'utf8');

    const failure = plugins.install({ name, ...(projectId != null && { projectId }) });

    await expect(failure).rejects.toBeInstanceOf(HttpError);
    await expect(failure).rejects.toMatchObject({ payload: { error: code } });
    expect(await readFile(path.join(daemonDir, 'plugins.json'), 'utf8')).toBe(manifest);
    expect(events).toHaveLength(1);
});

test('removing deletes only the entry and the copies: the other installs, own plugins and project files stay', async () => {
    const { plugins, projects, daemonDir, dataRoot, events } = await setup();
    const projectId = await createProject(projects, 'Praca');
    const project = await projects.get(projectId);
    await writeFile(path.join(project!.dir, 'notatki.md'), '# Notatki\n');
    await plugins.install({ name: 'gmail' });
    await plugins.install({ name: 'email-sorting', projectId });
    const ownBefore = await listTree(path.join(dataRoot, 'plugins'));
    const projectsBefore = await listTree(path.join(dataRoot, 'projects'));

    await plugins.remove({ name: 'gmail' });

    expect(JSON.parse(await readFile(path.join(daemonDir, 'plugins.json'), 'utf8'))).toEqual({
        installed: [{ name: 'email-sorting', projectId }],
    });
    expect(await readdir(path.join(daemonDir, 'plugins'))).toEqual(['email-sorting']);
    expect((await readdir(path.join(daemonDir, 'skills'))).toSorted()).toEqual([
        'email-sorting:setup',
        'email-sorting:sort',
        'my-notes:take-note',
    ]);
    expect(await listTree(path.join(dataRoot, 'plugins'))).toEqual(ownBefore);
    expect(await listTree(path.join(dataRoot, 'projects'))).toEqual(projectsBefore);
    expect(await readFile(path.join(FIXTURES, 'bundled', 'gmail', 'plugin.json'), 'utf8')).toContain('"gmail"');
    expect(events).toHaveLength(3);
});

test.each([
    ['a plugin installed elsewhere', { name: 'email-sorting', projectId: 'another' }],
    ['an own plugin', { name: 'my-notes' }],
])('refuses to remove %s, which is not installed there', async (_case, params) => {
    const { plugins, projects } = await setup();
    await plugins.install({ name: 'email-sorting', projectId: await createProject(projects, 'Praca') });

    await expect(plugins.remove(params)).rejects.toMatchObject({ payload: { error: 'PluginNotInstalled' } });
});

test('sync makes the folder match: drops stray entries, restores changed copies, takes changed own skills', async () => {
    const { plugins, daemonDir, dataRoot } = await setup();
    await plugins.install({ name: 'gmail' });
    const copied = path.join(daemonDir, 'skills', 'gmail:connect', 'SKILL.md');
    const original = await readFile(copied, 'utf8');

    expect(await plugins.sync()).toBe(false);

    await mkdir(path.join(daemonDir, 'skills', 'stale:skill'));
    await writeFile(path.join(daemonDir, 'plugins', 'stray.txt'), 'stray');
    await writeFile(copied, 'changed');
    await writeFile(path.join(dataRoot, 'plugins', 'my-notes', 'skills', 'take-note', 'SKILL.md'), '# Edited\n');

    expect(await plugins.sync()).toBe(true);
    expect(await readdir(path.join(daemonDir, 'plugins'))).toEqual(['gmail']);
    expect((await readdir(path.join(daemonDir, 'skills'))).toSorted()).toEqual([
        'gmail:connect',
        'gmail:read-mail',
        'my-notes:take-note',
    ]);
    expect(await readFile(copied, 'utf8')).toBe(original);
    expect(await readFile(path.join(daemonDir, 'skills', 'my-notes:take-note', 'SKILL.md'), 'utf8')).toBe('# Edited\n');
});

test('copies an own skill without its links: nothing from outside the plugin is pulled in', async () => {
    const { plugins, daemonDir, dataRoot, tmp } = await setup();
    const outside = path.join(tmp, 'outside');
    await mkdir(path.join(outside, 'folder'), { recursive: true });
    await writeFile(path.join(outside, 'secret.txt'), 'the person secret');
    await writeFile(path.join(outside, 'folder', 'secret.txt'), 'the person secret');
    const skill = path.join(dataRoot, 'plugins', 'my-notes', 'skills', 'take-note');
    await symlink(path.join(outside, 'secret.txt'), path.join(skill, 'file-link.txt'));
    await symlink(path.join(outside, 'folder'), path.join(skill, 'folder-link'));

    await plugins.sync();

    expect(await listTree(path.join(daemonDir, 'skills', 'my-notes:take-note'))).toEqual(['SKILL.md']);
});

test('leaves out an own skill too large to copy, with a warning', async () => {
    const { plugins, daemonDir, dataRoot, logs } = await setup();
    await plugins.sync();
    const skill = path.join(dataRoot, 'plugins', 'my-notes', 'skills', 'take-note');
    await writeFile(path.join(skill, 'video.bin'), Buffer.alloc(17 * 1024 * 1024));

    expect(await plugins.sync()).toBe(true);

    expect(await readdir(path.join(daemonDir, 'skills'))).toEqual([]);
    expect(logs.filter(log => log.level === 'warn').map(log => [log.message, log.data?.copy])).toEqual([
        ['Plugin copy failed, left out', 'my-notes:take-note'],
    ]);
});

test.each([['.poweragents'], ['.poweragents/skills'], ['.poweragents/plugins']])(
    'refuses to change anything when %s is a link, writing nothing where it points',
    async folder => {
        const { plugins, dataRoot, tmp, events } = await setup();
        const outside = path.join(tmp, 'outside');
        await mkdir(outside);
        await mkdir(path.dirname(path.join(dataRoot, folder)), { recursive: true });
        await symlink(outside, path.join(dataRoot, folder));

        await expect(plugins.install({ name: 'gmail' })).rejects.toThrow("Daemon's folder is not a folder");
        await expect(plugins.sync()).rejects.toThrow("Daemon's folder is not a folder");

        expect(await readdir(outside)).toEqual([]);
        expect(events).toEqual([]);
    },
);

test('replaces a link in place of the manifest or a copy, never writing where it points', async () => {
    const { plugins, daemonDir, tmp } = await setup();
    await plugins.sync();
    const outside = path.join(tmp, 'outside');
    await mkdir(path.join(outside, 'folder'), { recursive: true });
    await writeFile(path.join(outside, 'file.json'), 'the person file');
    await symlink(path.join(outside, 'file.json'), path.join(daemonDir, 'plugins.json'));
    await symlink(path.join(outside, 'folder'), path.join(daemonDir, 'skills', 'gmail:connect'));

    await plugins.install({ name: 'gmail' });

    expect(await readFile(path.join(outside, 'file.json'), 'utf8')).toBe('the person file');
    expect(await readdir(path.join(outside, 'folder'))).toEqual([]);
    expect((await lstat(path.join(daemonDir, 'plugins.json'))).isFile()).toBe(true);
    expect((await lstat(path.join(daemonDir, 'skills', 'gmail:connect'))).isDirectory()).toBe(true);
});

test('reads a malformed manifest as no installations, with a warning, and leaves it as it is', async () => {
    const { plugins, daemonDir, logs } = await setup();
    await mkdir(daemonDir);
    await writeFile(path.join(daemonDir, 'plugins.json'), '{"installed": "gmail"}');

    expect(await installsOf(plugins, 'gmail')).toEqual([]);
    await plugins.sync();

    expect(await readFile(path.join(daemonDir, 'plugins.json'), 'utf8')).toBe('{"installed": "gmail"}');
    expect(await readdir(path.join(daemonDir, 'plugins'))).toEqual([]);
    expect(
        logs.some(log => log.level === 'warn' && log.message === 'Plugin manifest malformed, no plugins installed'),
    ).toBe(true);
});

test('tells the sandbox when the skills changed, not when nothing or only the plugin copies changed', async () => {
    const { plugins, daemonDir, dataRoot, sandbox } = await setup();

    await plugins.sync();
    expect(sandbox.notified).toBe(1);

    expect(await plugins.sync()).toBe(false);
    await writeFile(path.join(daemonDir, 'plugins', 'stray.txt'), 'stray');
    expect(await plugins.sync()).toBe(true);
    expect(sandbox.notified).toBe(1);

    await writeFile(path.join(dataRoot, 'plugins', 'my-notes', 'skills', 'take-note', 'SKILL.md'), '# Edited\n');
    expect(await plugins.sync()).toBe(true);
    expect(sandbox.notified).toBe(2);
});

test('keeps the file the sandbox writes in the skill folder: it is not a stray entry', async () => {
    const { plugins, daemonDir, sandbox } = await setup();
    await plugins.sync();
    await writeFile(path.join(daemonDir, 'skills', SKILLS_SYNC_FILE), 'Sat Nov 14 12:00:00 UTC 2026\n');

    expect(await plugins.sync()).toBe(false);

    expect((await readdir(path.join(daemonDir, 'skills'))).toSorted()).toEqual([
        'my-notes:take-note',
        SKILLS_SYNC_FILE,
    ]);
    expect(sandbox.notified).toBe(1);
});

test('syncs even when the sandbox cannot be told, with a warning', async () => {
    const { plugins, daemonDir, logs } = await setup({ notifyFails: true });

    expect(await plugins.sync()).toBe(true);

    expect(await readdir(path.join(daemonDir, 'skills'))).toEqual(['my-notes:take-note']);
    expect(logs.filter(log => log.level === 'warn').map(log => log.message)).toEqual([
        'Sandbox not told the skills changed',
    ]);
});

interface SetupOptions {
    /** The fake sandbox rejects when told the skills changed. */
    notifyFails?: boolean;
}

async function setup(options: SetupOptions = {}) {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'poweragents-plugin-service-'));
    const dataRoot = path.join(tmp, 'root');
    await cp(path.join(FIXTURES, 'own'), path.join(dataRoot, 'plugins'), { recursive: true });
    const { container, logs } = createTestContainer();
    container.set(EnvVariables, {
        POWERAGENTS_DATA_ROOT: dataRoot,
        POWERAGENTS_PLUGINS_DIR: path.join(FIXTURES, 'bundled'),
    });
    const sandbox = { notified: 0 };
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
        notifySkillsChanged: () => {
            sandbox.notified++;
            return options.notifyFails ? Promise.reject(new Error('limactl shell failed')) : Promise.resolve();
        },
    });
    const plugins = container.resolve(PluginService);
    const events: PluginsChangedEvent[] = [];
    plugins.listen(event => events.push(event));
    return {
        plugins,
        projects: container.resolve(ProjectService),
        daemonDir: path.join(dataRoot, '.poweragents'),
        dataRoot,
        tmp,
        logs,
        events,
        sandbox,
    };
}

async function createProject(projects: ProjectServiceShape, name: string) {
    const result = await projects.create(name);
    if (!('created' in result)) {
        throw new Error('Project not created');
    }
    return result.created.id;
}

async function installsOf(plugins: PluginServiceShape, name: string): Promise<PluginInstall[]> {
    const plugin = (await plugins.list()).find(item => item.name === name);
    return plugin?.installs ?? [];
}

/** Every path under `dir`, relative and sorted. */
async function listTree(dir: string) {
    const entries = await readdir(dir, { recursive: true });
    return entries.toSorted();
}
