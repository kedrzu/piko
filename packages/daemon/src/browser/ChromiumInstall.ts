import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { assert } from '@nzyme/utils/assert.js';
import { createSingleRunner } from '@nzyme/utils/createSingleRunner.js';

import { POWERAGENTS_LIMA_HOME } from '../env.js';
import { ChromiumReleases } from './chromiumRelease.js';
import type { ChromiumRelease } from './chromiumRelease.js';

/**
 * The agent's own Chromium: a pinned Chrome for Testing the daemon downloads on first start, like the sandbox's image,
 * so the installer carries no browser. It lives in `chromium/<version>-<platform>/` beside Lima's home; that folder
 * exists only once a verified archive is fully unpacked.
 */
export interface ChromiumInstallShape {
    /**
     * Downloads, verifies and unpacks the pinned build unless it is installed. Calls made meanwhile join the running
     * install. A failure rejects and is logged; the next call starts over. Does nothing where no build is pinned.
     */
    ensure(): Promise<void>;
    /** The browser's executable once installed; `null` while it is not (or where no build is pinned). */
    getExecutable(): string | null;
}

/** Prefix of everything an install in progress leaves in the chromium folder; a failed install's leftovers are removed. */
const TEMP_PREFIX = '.install-';

export const ChromiumInstall = defineService({
    name: 'ChromiumInstall',
    deps: { logger: Logger, getRelease: ChromiumReleases, limaHome: POWERAGENTS_LIMA_HOME },
    setup({ logger, getRelease, limaHome }): ChromiumInstallShape {
        const chromiumFolder = path.join(path.dirname(limaHome), 'chromium');
        const installRunner = createSingleRunner({ handler: install });

        return { ensure, getExecutable };

        async function ensure() {
            const release = getRelease();
            if (!release) {
                logger.info('No Chromium is pinned for this computer, the agent gets no browser');
                return;
            }
            if (isInstalled(release)) {
                return;
            }

            try {
                await installRunner.execute();
            } catch (error) {
                logger.error('Chromium failed to install', { error });
                throw error;
            }
        }

        function getExecutable() {
            const release = getRelease();
            return release && isInstalled(release) ? getExecutablePath(release) : null;
        }

        function getInstallFolder(release: ChromiumRelease) {
            return path.join(chromiumFolder, `${release.version}-${release.platform}`);
        }

        function getExecutablePath(release: ChromiumRelease) {
            return path.join(getInstallFolder(release), release.executable);
        }

        function isInstalled(release: ChromiumRelease) {
            return existsSync(getExecutablePath(release));
        }

        async function install() {
            const release = getRelease();
            assert(release, 'A Chromium release is pinned');
            if (isInstalled(release)) {
                return;
            }

            logger.info('Chromium is downloading', { version: release.version, platform: release.platform });
            await mkdir(chromiumFolder, { recursive: true });
            await removeLeftovers(name => name.startsWith(TEMP_PREFIX));

            const work = await mkdtemp(path.join(chromiumFolder, TEMP_PREFIX));
            try {
                const archive = path.join(work, 'chromium.zip');
                const unpacked = path.join(work, 'unpacked');
                await download(release, archive);
                await unpack(archive, unpacked);

                const folder = getInstallFolder(release);
                await rm(folder, { recursive: true, force: true });
                await rename(unpacked, folder);
                assert(isInstalled(release), 'The archive holds the executable');
            } finally {
                await rm(work, { recursive: true, force: true });
            }

            await removeLeftovers(name => name !== path.basename(getInstallFolder(release)));
            logger.info('Chromium is installed', { version: release.version });
        }

        /** Streams the archive to `file` and fails, leaving nothing behind to unpack, unless its SHA-256 is the pin. */
        async function download(release: ChromiumRelease, file: string) {
            const response = await fetch(release.url);
            if (!response.ok || !response.body) {
                throw new Error(`Chromium download failed: HTTP ${response.status}`);
            }

            const hasher = new Bun.CryptoHasher('sha256');
            const writer = Bun.file(file).writer();
            const body: ReadableStream<Uint8Array> = response.body;
            const reader = body.getReader();
            try {
                for (let part = await reader.read(); !part.done; part = await reader.read()) {
                    hasher.update(part.value);
                    await writer.write(part.value);
                }
            } finally {
                await writer.end();
            }

            const actual = hasher.digest('hex');
            if (actual !== release.sha256) {
                await rm(file, { force: true });
                throw new Error(`Chromium download does not match the pinned checksum (got ${actual})`);
            }
        }

        /** `ditto` keeps the symlinks of the app's frameworks, which a plain unzip would break. */
        async function unpack(archive: string, destination: string) {
            const child = Bun.spawn(['ditto', '-x', '-k', archive, destination], { stdout: 'ignore', stderr: 'pipe' });
            const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
            if (exitCode !== 0) {
                throw new Error(`Chromium failed to unpack (ditto exit ${exitCode}): ${stderr.trim()}`);
            }
        }

        async function removeLeftovers(shouldRemove: (name: string) => boolean) {
            for (const name of await readdir(chromiumFolder)) {
                if (shouldRemove(name)) {
                    await rm(path.join(chromiumFolder, name), { recursive: true, force: true });
                }
            }
        }
    },
});
