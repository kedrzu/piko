import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { removeOtherVersions } from './removeOtherVersions.js';

const folders: string[] = [];

afterEach(async () => {
    for (const folder of folders.splice(0)) {
        await rm(folder, { recursive: true, force: true });
    }
});

test('keeps the installed version and an install in progress, removes every other version', async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'pa-chromium-'));
    folders.push(cacheDir);
    for (const name of ['157.0.8103.78-mac-arm64', '156.0.7000.1-mac-arm64', '157.0.8103.78-mac-x64', '.install-a1']) {
        await mkdir(path.join(cacheDir, name, 'chrome-mac-arm64'), { recursive: true });
    }

    await removeOtherVersions(
        cacheDir,
        path.join(cacheDir, '157.0.8103.78-mac-arm64', 'chrome-mac-arm64', 'Google Chrome for Testing'),
    );

    expect((await readdir(cacheDir)).toSorted()).toEqual(['.install-a1', '157.0.8103.78-mac-arm64']);
});
