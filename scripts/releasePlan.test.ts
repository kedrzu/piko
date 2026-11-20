import { expect, test } from 'bun:test';

import { composeUpdaterManifest, developmentVersion, findLastStableTag, hasNoCode } from './releasePlan.js';

const DOWNLOAD_URL = 'https://github.com/kedrzu/piko/releases/download/development';

test.each<{ files: string[]; expected: boolean }>([
    { files: ['docs/design/a.png', '.claude/skills/x/SKILL.md', 'README.md', 'piko.pen'], expected: true },
    { files: ['docs/design/piko/notes.txt'], expected: true },
    { files: ['README.md', 'packages/app/a.ts'], expected: false },
    { files: ['README.mdx'], expected: false },
    { files: ['packages/docs/a.ts'], expected: false },
    { files: ['.github/workflows/development.yml'], expected: false },
    { files: [], expected: false },
])('hasNoCode of $files is $expected', ({ files, expected }) => {
    expect(hasNoCode(files)).toBe(expected);
});

test('findLastStableTag compares numerically and ignores prereleases and unknown tags', () => {
    const tags = ['v0.9.0', 'v0.10.0', 'v0.11.0-rc.1', 'v1.0', 'latest', 'v0.10.0-beta', 'xv0.12.0'];
    expect(findLastStableTag(tags)).toBe('v0.10.0');
});

test.each<{ tags: string[]; commitCount: number; expected: string }>([
    { tags: ['v0.9.0', 'v0.10.0'], commitCount: 5, expected: '0.11.0-dev.5' },
    { tags: ['v1.4.0'], commitCount: 9, expected: '1.5.0-dev.9' },
    { tags: [], commitCount: 3, expected: '0.1.0-dev.3' },
    { tags: ['v0.2.0', 'v0.3.0-dev.9', 'nightly'], commitCount: 7, expected: '0.3.0-dev.7' },
])('developmentVersion of $tags at $commitCount commits is $expected', ({ tags, commitCount, expected }) => {
    expect(developmentVersion({ tags, commitCount })).toBe(expected);
});

test('composeUpdaterManifest gives darwin-aarch64 its bundle and signature and ignores other files', () => {
    const result = compose(['piko_0.1.0_aarch64.dmg', 'piko_aarch64.app.tar.gz', 'piko_aarch64.app.tar.gz.sig']);
    if (!result.valid) {
        throw new Error(result.reason);
    }
    expect(result.manifest).toEqual({
        version: '0.1.0-dev.4',
        notes: '',
        pub_date: '2026-11-05T11:21:24.295Z',
        platforms: {
            'darwin-aarch64': {
                signature: 'signature of piko_aarch64.app.tar.gz.sig',
                url: `${DOWNLOAD_URL}/piko_aarch64.app.tar.gz`,
            },
        },
    });
});

test('composeUpdaterManifest fails on a signature of an unknown bundle instead of leaving a platform out', () => {
    const result = compose(['piko_x64.app.tar.gz', 'piko_x64.app.tar.gz.sig']);
    expect(result).toEqual({
        valid: false,
        reason: 'piko_x64.app.tar.gz.sig signs no updater bundle this release knows',
    });
});

test('composeUpdaterManifest fails on a signature whose bundle is not on the release', () => {
    const result = compose(['piko_aarch64.app.tar.gz.sig']);
    expect(result).toEqual({
        valid: false,
        reason: 'the release has piko_aarch64.app.tar.gz.sig but no piko_aarch64.app.tar.gz',
    });
});

function compose(assets: string[]) {
    const signatures = Object.fromEntries(
        assets.filter(name => name.endsWith('.sig')).map(name => [name, `signature of ${name}`]),
    );
    return composeUpdaterManifest({
        version: '0.1.0-dev.4',
        pubDate: '2026-11-05T11:21:24.295Z',
        downloadUrl: DOWNLOAD_URL,
        assets,
        signatures,
    });
}
