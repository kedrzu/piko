import { expect, test } from 'bun:test';
import { chmod, cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

import type { PluginError, PluginInfo, PluginSource } from '@piko/common/api/PluginTypes.js';

import { PluginCatalog } from './PluginCatalog.js';
import type { LocalPlugin } from './PluginCatalog.js';

// The filesystem is the boundary: each test gets its own data root in a fresh temporary folder, its own plugins copied
// from `fixtures/own`; the bundled plugins are read from `fixtures/bundled` unless a test points elsewhere.

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

test('lists both sources sorted by name; an own plugin that conflicts, declares the project level or is misnamed is not loaded', async () => {
    const { catalog } = await setup();

    const plugins = await catalog.list();

    const expected: PluginSummary[] = [
        { name: 'email-sorting', source: 'bundled', errors: [] },
        { name: 'gmail', source: 'bundled', errors: [] },
        { name: 'gmail', source: 'own', errors: [{ code: 'conflict' }] },
        { name: 'my-notes', source: 'own', errors: [] },
        { name: 'old-name', source: 'own', errors: [{ code: 'nameMismatch' }] },
        { name: 'team-board', source: 'own', errors: [{ code: 'projectLevel' }] },
    ];
    expect(plugins.map(summarize)).toEqual(expected);

    const emailSorting: PluginInfo = {
        name: 'email-sorting',
        source: 'bundled',
        details: {
            level: 'project',
            tags: ['email', 'organizing'],
            marketplace: {
                pl: { title: 'email-sorting (pl)', description: 'Opis email-sorting.' },
                en: { title: 'email-sorting', description: 'Describes email-sorting.' },
            },
            onboarding: 'setup',
            skills: ['setup', 'sort'],
        },
        installs: [],
        errors: [],
        environmentError: null,
    };
    expect(plugins[0]!).toMatchObject(emailSorting);
    expect(plugins[0]!.dir).toBe(path.join(FIXTURES, 'bundled', 'email-sorting'));
    expect(plugins[0]!.manifest?.environment).toEqual({
        cli: 'cli',
        npm: { 'left-pad': '1.3.0' },
        python: { requests: '2.31.0' },
    });
});

test('an own plugin named like a bundled one is a conflict and the bundled one wins', async () => {
    const { catalog, ownDir } = await setup();

    const gmail = await catalog.get('gmail');

    expect(gmail?.source).toBe('bundled');
    expect(gmail?.dir).toBe(path.join(FIXTURES, 'bundled', 'gmail'));
    expect(gmail?.errors).toEqual([]);
    const own = (await catalog.list()).find(plugin => plugin.name === 'gmail' && plugin.source === 'own');
    expect(own?.dir).toBe(path.join(ownDir, 'gmail'));
    expect(own?.errors).toEqual([{ code: 'conflict' }]);
});

test('reports a broken, linked or oversized plugin.json of an own plugin, never reading through a link', async () => {
    const { catalog, ownDir, tmp } = await setup();
    // A valid plugin outside the data root, which a link could point at.
    const outside = path.join(tmp, 'outside');
    await cp(path.join(FIXTURES, 'own', 'my-notes'), path.join(outside, 'linked-folder'), { recursive: true });
    await writeFile(path.join(outside, 'plugin.json'), JSON.stringify(manifestOf('linked-file')));

    await symlink(path.join(outside, 'linked-folder'), path.join(ownDir, 'linked-folder'));
    await mkdir(path.join(ownDir, 'linked-file'));
    await symlink(path.join(outside, 'plugin.json'), path.join(ownDir, 'linked-file', 'plugin.json'));
    await mkdir(path.join(ownDir, 'not-json'));
    await writeFile(path.join(ownDir, 'not-json', 'plugin.json'), '{ "name": ');
    await mkdir(path.join(ownDir, 'too-large'));
    await writeFile(
        path.join(ownDir, 'too-large', 'plugin.json'),
        JSON.stringify({ ...manifestOf('too-large'), padding: 'x'.repeat(64 * 1024) }),
    );
    await mkdir(path.join(ownDir, 'folder-manifest', 'plugin.json'), { recursive: true });
    await mkdir(path.join(ownDir, 'no-manifest'));
    await mkdir(path.join(ownDir, 'bad-shape'));
    await writeFile(
        path.join(ownDir, 'bad-shape', 'plugin.json'),
        JSON.stringify({ ...manifestOf('bad-shape'), tags: 'x' }),
    );

    const plugins = await catalog.list();

    const broken = plugins.filter(plugin => plugin.details === null).map(summarize);
    const expected: PluginSummary[] = [
        { name: 'bad-shape', source: 'own', errors: [{ code: 'invalidField', field: 'tags' }] },
        { name: 'folder-manifest', source: 'own', errors: [{ code: 'manifestNotFile' }] },
        { name: 'linked-file', source: 'own', errors: [{ code: 'manifestNotFile' }] },
        { name: 'linked-folder', source: 'own', errors: [{ code: 'notFolder' }] },
        { name: 'no-manifest', source: 'own', errors: [{ code: 'manifestMissing' }] },
        { name: 'not-json', source: 'own', errors: [{ code: 'manifestNotJson' }] },
        { name: 'too-large', source: 'own', errors: [{ code: 'manifestTooLarge' }] },
    ];
    expect(broken).toEqual(expected);
    // The valid plugins still list.
    expect(plugins.find(plugin => plugin.name === 'my-notes')?.errors).toEqual([]);
});

test('reports a plugin.json it cannot read as the plugin error, with a warning', async () => {
    const { catalog, ownDir, logs } = await setup();
    await chmod(path.join(ownDir, 'my-notes', 'plugin.json'), 0o000);

    const myNotes = await catalog.get('my-notes');

    expect(myNotes?.errors).toEqual([{ code: 'unreadable' }]);
    expect(logs.filter(log => log.level === 'warn').map(log => [log.message, log.data?.folder])).toEqual([
        ['Plugin unreadable', 'my-notes'],
    ]);
});

test('lists the bundled plugins and no own ones, with a warning, when the own plugins folder cannot be read', async () => {
    const { catalog, ownDir, logs } = await setup();
    await chmod(ownDir, 0o000);

    const plugins = await catalog.list();
    await chmod(ownDir, 0o755);

    expect(plugins.map(summarize)).toEqual([
        { name: 'email-sorting', source: 'bundled', errors: [] },
        { name: 'gmail', source: 'bundled', errors: [] },
    ]);
    expect(logs.filter(log => log.level === 'warn').map(log => log.message)).toEqual([
        'Own plugins folder unreadable, no own plugins listed',
    ]);
});

test('lists no own plugins when their folder is a link', async () => {
    const { catalog, ownDir, tmp } = await setup();
    const moved = path.join(tmp, 'elsewhere');
    await cp(ownDir, moved, { recursive: true });
    await rm(ownDir, { recursive: true });
    await symlink(moved, ownDir);

    const plugins = await catalog.list();

    expect(plugins.map(summarize)).toEqual([
        { name: 'email-sorting', source: 'bundled', errors: [] },
        { name: 'gmail', source: 'bundled', errors: [] },
    ]);
});

test('reports skills that are not real folders with a SKILL.md file, and a missing onboarding skill', async () => {
    const { catalog, ownDir, tmp } = await setup();
    const skills = path.join(ownDir, 'my-notes', 'skills');
    await writeFile(path.join(ownDir, 'my-notes', 'plugin.json'), JSON.stringify(manifestOf('my-notes', 'welcome')));
    await mkdir(path.join(skills, 'Bad_Name'));
    await writeFile(path.join(skills, 'Bad_Name', 'SKILL.md'), '# Bad');
    await mkdir(path.join(skills, 'empty'));
    await mkdir(path.join(tmp, 'outside-skill'));
    await writeFile(path.join(tmp, 'outside-skill', 'SKILL.md'), '# Outside');
    await symlink(path.join(tmp, 'outside-skill'), path.join(skills, 'linked'));
    await mkdir(path.join(skills, 'linked-file'));
    await symlink(path.join(tmp, 'outside-skill', 'SKILL.md'), path.join(skills, 'linked-file', 'SKILL.md'));
    // A stray file beside the skills is not one.
    await writeFile(path.join(skills, 'notes.txt'), 'notes');

    const myNotes = await catalog.get('my-notes');

    expect(myNotes?.details?.skills).toEqual(['take-note']);
    const expected: PluginError[] = [
        { code: 'invalidSkill', skill: 'Bad_Name' },
        { code: 'invalidSkill', skill: 'empty' },
        { code: 'invalidSkill', skill: 'linked' },
        { code: 'invalidSkill', skill: 'linked-file' },
        { code: 'onboardingMissing', skill: 'welcome' },
    ];
    expect(myNotes?.errors).toEqual(expected);
});

test('lists nothing when neither source folder exists', async () => {
    const { catalog } = await setup({ bundledDir: path.join(os.tmpdir(), 'piko-no-such-folder'), own: false });

    expect(await catalog.list()).toEqual([]);
});

interface PluginSummary {
    name: string;
    source: PluginSource;
    errors: PluginError[];
}

interface SetupOptions {
    bundledDir?: string;
    /** Whether the data root gets the own plugins of `fixtures/own`; without them it does not exist. */
    own?: boolean;
}

async function setup({ bundledDir = path.join(FIXTURES, 'bundled'), own = true }: SetupOptions = {}) {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'piko-plugins-'));
    const dataRoot = path.join(tmp, 'root');
    const ownDir = path.join(dataRoot, 'plugins');
    if (own) {
        await cp(path.join(FIXTURES, 'own'), ownDir, { recursive: true });
    }
    const { container, logs } = createTestContainer();
    container.set(EnvVariables, { PIKO_DATA_ROOT: dataRoot, PIKO_PLUGINS_DIR: bundledDir });
    const catalog = container.resolve(PluginCatalog);
    return { catalog, ownDir, tmp, logs };
}

function summarize(plugin: LocalPlugin): PluginSummary {
    return { name: plugin.name, source: plugin.source, errors: plugin.errors };
}

function manifestOf(name: string, onboarding?: string) {
    return {
        name,
        level: 'profile',
        tags: [],
        marketplace: { pl: { title: name, description: name }, en: { title: name, description: name } },
        ...(onboarding != null && { onboarding }),
    };
}
