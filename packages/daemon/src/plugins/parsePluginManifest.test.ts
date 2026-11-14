import { expect, test } from 'bun:test';

import type { PluginManifest, PluginManifestParseResult } from './parsePluginManifest.js';
import { parsePluginManifest } from './parsePluginManifest.js';

test('parses a full manifest and drops fields it does not know', () => {
    const result = parsePluginManifest({
        ...validManifest(),
        onboarding: 'setup',
        environment: {
            cli: 'tools/cli',
            npm: { '@scope/pkg': '1.2.3-beta.1', 'left-pad': '1.3.0' },
            python: { requests: '2.31.0', Django: '5.0rc1' },
            unknown: true,
        },
        accounts: ['google'],
    });

    const expected: PluginManifestParseResult = {
        manifest: {
            ...validManifest(),
            onboarding: 'setup',
            environment: {
                cli: 'tools/cli',
                npm: { '@scope/pkg': '1.2.3-beta.1', 'left-pad': '1.3.0' },
                python: { requests: '2.31.0', Django: '5.0rc1' },
            },
        },
    };
    expect(result).toEqual(expected);
});

test('reports every invalid field, not only the first', () => {
    const result = parsePluginManifest({
        name: 'Email_Sorting',
        level: 'team',
        tags: ['ok', 3],
        marketplace: { pl: { title: 'Sortowanie', description: 'Opis' }, en: { title: '', description: 'x' } },
        onboarding: '../setup',
        environment: {
            cli: '../outside',
            npm: { 'left-pad': '^1.3.0', '-rf': '1.0.0', ok: '1.0.0' },
            python: { requests: '>=2.0' },
        },
    });

    const expected: PluginManifestParseResult = {
        errors: [
            { code: 'invalidField', field: 'name' },
            { code: 'invalidField', field: 'level' },
            { code: 'invalidField', field: 'tags' },
            { code: 'invalidField', field: 'marketplace.en' },
            { code: 'invalidField', field: 'onboarding' },
            { code: 'invalidField', field: 'environment.cli' },
            { code: 'invalidField', field: 'environment.npm.left-pad' },
            { code: 'invalidField', field: 'environment.npm.-rf' },
            { code: 'invalidField', field: 'environment.python.requests' },
        ],
    };
    expect(result).toEqual(expected);
});

test('requires the marketplace text in every app language', () => {
    const result = parsePluginManifest({ ...validManifest(), marketplace: { en: validManifest().marketplace.en } });

    const expected: PluginManifestParseResult = { errors: [{ code: 'invalidField', field: 'marketplace.pl' }] };
    expect(result).toEqual(expected);
});

test.each(['../cli', 'cli/../../x', '/usr/bin', 'C:\\cli', 'a\\..\\b', '', '.', 'a//b', 'cli/'])(
    'refuses a CLI path that could leave the plugin folder: %p',
    cli => {
        const result = parsePluginManifest({ ...validManifest(), environment: { cli } });

        const expected: PluginManifestParseResult = { errors: [{ code: 'invalidField', field: 'environment.cli' }] };
        expect(result).toEqual(expected);
    },
);

test('reports a file that is not a JSON object', () => {
    const expected: PluginManifestParseResult = { errors: [{ code: 'invalidField', field: '' }] };

    expect(parsePluginManifest(['name'])).toEqual(expected);
    expect(parsePluginManifest(null)).toEqual(expected);
});

function validManifest(): PluginManifest {
    return {
        name: 'email-sorting',
        level: 'project',
        tags: ['email'],
        marketplace: {
            pl: { title: 'Sortowanie poczty', description: 'Porządkuje skrzynkę.' },
            en: { title: 'Email sorting', description: 'Sorts the inbox.' },
        },
    };
}
