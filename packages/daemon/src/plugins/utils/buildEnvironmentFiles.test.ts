import { expect, test } from 'bun:test';

import type { PluginEnvironmentError } from '@poweragents/common/api/PluginTypes.js';

import { buildEnvironmentFiles } from './buildEnvironmentFiles.js';
import type { EnvironmentFiles, EnvironmentPlugin } from './buildEnvironmentFiles.js';

const GMAIL: EnvironmentPlugin = {
    name: 'gmail',
    dir: '/Poweragents/.poweragents/plugins/gmail',
    environment: { cli: 'tools/cli', npm: { 'left-pad': '1.3.0' }, python: { requests: '2.31.0' } },
};
const NOTES: EnvironmentPlugin = {
    name: 'my-notes',
    dir: '/Poweragents/plugins/my-notes',
    environment: { npm: { '@scope/zod': '3.0.0', 'left-pad': '1.3.0' } },
};

test('renders every pin and each CLI as a file dependency, sorted, the same whatever the plugin order', () => {
    const files = buildEnvironmentFiles([GMAIL, NOTES]);

    const expected: EnvironmentFiles = {
        packageJson: `${JSON.stringify(
            {
                private: true,
                dependencies: {
                    '@poweragents-plugins/gmail': 'file:/Poweragents/.poweragents/plugins/gmail/tools/cli',
                    '@scope/zod': '3.0.0',
                    'left-pad': '1.3.0',
                },
            },
            null,
            4,
        )}\n`,
        requirements: 'requests==2.31.0\n',
        parts: { npm: ['gmail', 'my-notes'], python: ['gmail'] },
        conflicts: new Map(),
    };
    expect(files).toEqual(expected);
    expect(buildEnvironmentFiles([NOTES, GMAIL])).toEqual(expected);
});

test('no plugins: empty dependencies, so an install removes every package, and no requirements', () => {
    const files = buildEnvironmentFiles([]);

    expect(JSON.parse(files.packageJson)).toEqual({ private: true, dependencies: {} });
    expect(files.requirements).toBe('');
});

test('a plugin pinning another version than one before it by name is left out whole; the rest still applies', () => {
    const beta: EnvironmentPlugin = {
        name: 'beta',
        dir: '/Poweragents/plugins/beta',
        environment: { cli: 'cli', npm: { chalk: '5.0.0' }, python: { Requests: '2.0.0' } },
    };
    const alpha: EnvironmentPlugin = {
        name: 'alpha',
        dir: '/Poweragents/plugins/alpha',
        environment: { python: { requests: '2.31.0' } },
    };
    const zeta: EnvironmentPlugin = {
        name: 'zeta',
        dir: '/Poweragents/plugins/zeta',
        environment: { npm: { chalk: '4.0.0' } },
    };

    const files = buildEnvironmentFiles([zeta, beta, alpha]);

    // `Requests` is `requests` (PEP 503): beta conflicts with alpha, which comes first, and loses its CLI and chalk too;
    // zeta's chalk then conflicts with nothing.
    const conflict: PluginEnvironmentError = { code: 'conflict', part: 'python', package: 'requests', plugin: 'alpha' };
    expect(files.conflicts).toEqual(new Map([['beta', conflict]]));
    expect(JSON.parse(files.packageJson)).toEqual({ private: true, dependencies: { chalk: '4.0.0' } });
    expect(files.requirements).toBe('requests==2.31.0\n');
    expect(files.parts).toEqual({ npm: ['zeta'], python: ['alpha'] });
});

test('plugins pinning the same version share it', () => {
    const other: EnvironmentPlugin = { ...NOTES, name: 'other', dir: '/Poweragents/plugins/other' };

    const files = buildEnvironmentFiles([NOTES, other]);

    expect(files.conflicts.size).toBe(0);
    expect(files.parts.npm).toEqual(['my-notes', 'other']);
});
