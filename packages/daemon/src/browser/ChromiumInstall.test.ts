import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

import { ChromiumInstall } from './ChromiumInstall.js';
import { ChromiumReleases } from './chromiumRelease.js';
import type { ChromiumRelease } from './chromiumRelease.js';

// The network is the boundary: a local server stands in for Google's storage. Only the unpacking needs macOS's `ditto`,
// so the test that installs for real runs there; the checksum and failure paths end before it and run everywhere.

const EXECUTABLE = 'chrome-test/chrome';

let tmp: string;
let server: ReturnType<typeof Bun.serve>;
let goodZip: Uint8Array;
let truncated = false;

beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'poweragents-chromium-'));
    if (process.platform === 'darwin') {
        goodZip = await createZip();
    } else {
        goodZip = new TextEncoder().encode('not really a zip, never unpacked here');
    }
    server = Bun.serve({
        port: 0,
        fetch(request) {
            const { pathname } = new URL(request.url);
            if (pathname === '/good.zip') {
                return new Response(goodZip);
            }
            if (pathname === '/partial.zip') {
                let sent = false;
                const body = new ReadableStream({
                    async pull(controller) {
                        if (!sent) {
                            sent = true;
                            controller.enqueue(goodZip.slice(0, 10));
                            return;
                        }
                        truncated = true;
                        await Bun.sleep(20);
                        controller.close();
                    },
                });
                return new Response(body);
            }
            return new Response('nope', { status: 404 });
        },
    });
});

afterAll(async () => {
    await server.stop(true);
});

describe('ensure', () => {
    test('rejects a download that is not the pinned archive and leaves no install and no leftovers', async () => {
        const { install, chromium } = setup({ sha256: sha256Of(new Uint8Array([1, 2, 3])) });

        await expect(install.ensure()).rejects.toThrow('pinned checksum');

        expect(install.getExecutable()).toBeNull();
        expect(await readdir(chromium)).toEqual([]);
    });

    test('rejects a download cut short and leaves no install', async () => {
        const { install, chromium, release } = setup({ path: '/partial.zip' });

        await expect(install.ensure()).rejects.toThrow();

        expect(truncated).toBe(true);
        expect(install.getExecutable()).toBeNull();
        expect(await readdir(chromium)).not.toContain(`${release.version}-${release.platform}`);
    });

    test('rejects a failed request', async () => {
        const { install } = setup({ path: '/missing.zip' });

        await expect(install.ensure()).rejects.toThrow('HTTP 404');

        expect(install.getExecutable()).toBeNull();
    });

    test('does nothing where no build is pinned', async () => {
        const { install } = setup({ pinned: false });

        await install.ensure();

        expect(install.getExecutable()).toBeNull();
    });

    test.skipIf(process.platform !== 'darwin')(
        'unpacks a verified archive, serves concurrent calls once, and removes older versions and leftovers',
        async () => {
            const { install, chromium, release } = setup({});
            await mkdir(path.join(chromium, '1.0.0-test'), { recursive: true });
            await mkdir(path.join(chromium, '.install-stale'), { recursive: true });

            await Promise.all([install.ensure(), install.ensure()]);

            expect(install.getExecutable()).toBe(
                path.join(chromium, `${release.version}-${release.platform}`, EXECUTABLE),
            );
            expect(await Bun.file(install.getExecutable() ?? '').text()).toBe('#!/bin/sh\n');
            expect(await readdir(chromium)).toEqual([`${release.version}-${release.platform}`]);

            await install.ensure();
        },
    );
});

function setup(options: { sha256?: string; path?: string; pinned?: boolean }) {
    const home = path.join(tmp, crypto.randomUUID(), 'lima');
    const chromium = path.join(path.dirname(home), 'chromium');
    const release: ChromiumRelease = {
        version: '9.9.9',
        platform: 'test',
        url: `http://localhost:${server.port}${options.path ?? '/good.zip'}`,
        sha256: options.sha256 ?? sha256Of(goodZip),
        executable: EXECUTABLE,
    };
    const { container } = createTestContainer();
    container.set(EnvVariables, { POWERAGENTS_LIMA_HOME: home });
    container.set(ChromiumReleases, () => (options.pinned === false ? null : release));
    return { install: container.resolve(ChromiumInstall), chromium, release };
}

function sha256Of(bytes: Uint8Array) {
    return new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
}

async function createZip() {
    const source = path.join(tmp, 'zip-source');
    await mkdir(path.join(source, 'chrome-test'), { recursive: true });
    await writeFile(path.join(source, EXECUTABLE), '#!/bin/sh\n', { mode: 0o755 });
    const archive = path.join(tmp, 'good.zip');
    const child = Bun.spawn(['ditto', '-c', '-k', source, archive]);
    expect(await child.exited).toBe(0);
    return new Uint8Array(await Bun.file(archive).arrayBuffer());
}
