import { expect, test } from 'bun:test';

import type { PluginInfo, PluginInstall, PluginLevel } from '@piko/common/api/PluginTypes.js';
import type { OpencodePermissionRule } from '@piko/opencode/OpencodeTypes.js';

import { buildSkillDenyRules } from './buildSkillDenyRules.js';

const PLUGINS: PluginInfo[] = [
    plugin({ name: 'email-sorting', level: 'project', skills: ['setup', 'sort'], installs: [{ projectId: 'praca' }] }),
    plugin({
        name: 'invoices',
        level: 'project',
        skills: ['scan'],
        installs: [{ projectId: 'praca' }, { projectId: 'dom' }],
    }),
    plugin({ name: 'budget', level: 'project', skills: ['plan'], installs: [] }),
    plugin({ name: 'gmail', level: 'profile', skills: ['connect', 'read-mail'], installs: [{ profile: true }] }),
    {
        ...plugin({ name: 'my-notes', level: 'profile', skills: ['take-note'], installs: [{ profile: true }] }),
        source: 'own',
    },
];

test('hides from another project the skills of a project plugin installed only elsewhere', () => {
    const expected: OpencodePermissionRule[] = [
        { action: 'skill', resource: 'email-sorting:setup', effect: 'deny' },
        { action: 'skill', resource: 'email-sorting:sort', effect: 'deny' },
    ];
    expect(buildSkillDenyRules('dom', PLUGINS)).toEqual(expected);
});

test('hides nothing in a project where every installed project plugin is installed', () => {
    expect(buildSkillDenyRules('praca', PLUGINS)).toEqual([]);
});

test('hides a project plugin from a project that has none, never a profile plugin', () => {
    const resources = buildSkillDenyRules('nowy', PLUGINS).map(rule => rule.resource);
    expect(resources).toEqual(['email-sorting:setup', 'email-sorting:sort', 'invoices:scan']);
});

test('needs no rule for a plugin with errors, which is never copied', () => {
    const broken: PluginInfo = { ...PLUGINS[0]!, errors: [{ code: 'invalidSkill', skill: 'sort' }] };
    expect(buildSkillDenyRules('dom', [broken])).toEqual([]);
});

function plugin({ name, level, skills, installs }: PluginParams): PluginInfo {
    return {
        name,
        source: 'bundled',
        details: {
            level,
            tags: [],
            marketplace: {
                pl: { title: name, description: '' },
                en: { title: name, description: '' },
            },
            skills,
        },
        installs,
        errors: [],
        environmentError: null,
    };
}

interface PluginParams {
    name: string;
    level: PluginLevel;
    skills: string[];
    installs: PluginInstall[];
}
