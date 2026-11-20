import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

import { ActiveProviderStore } from './ActiveProviderStore.js';

test('a recorded provider is read back, from a file only its owner can read', async () => {
    const { store, filePath } = await setup();

    await store.set('chatgpt');

    expect(await store.get()).toBe('chatgpt');
    expect(await Bun.file(filePath).json()).toEqual({ provider: 'chatgpt' });
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
});

test('no file reads as no record', async () => {
    const { store } = await setup();

    expect(await store.get()).toBeUndefined();
});

test('a corrupt file or an unknown provider reads as no record, and the next record replaces it', async () => {
    const { store, filePath } = await setup();
    await mkdir(path.dirname(filePath), { recursive: true });

    await writeFile(filePath, '{"provider":', { mode: 0o644 });
    expect(await store.get()).toBeUndefined();
    await writeFile(filePath, '{"provider":"gemini"}');
    expect(await store.get()).toBeUndefined();

    await store.set('claude');
    expect(await store.get()).toBe('claude');
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
});

/** A store under a scratch `PIKO_LIMA_HOME`, so the real `~/.piko` is never touched. */
async function setup() {
    const { container } = createTestContainer();
    const home = await mkdtemp(path.join(os.tmpdir(), 'piko-provider-'));
    container.set(EnvVariables, { PIKO_LIMA_HOME: path.join(home, 'lima') });
    return { store: container.resolve(ActiveProviderStore), filePath: path.join(home, 'ai-provider.json') };
}
