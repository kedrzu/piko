import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

/**
 * Removes every installed Chrome for Testing version in `cacheDir` but the one `executablePath` lies in: the daemon
 * owns its cache, and a version it no longer launches only takes space. An installed version is a `<version>-<platform>`
 * folder; hidden entries, such as an install in progress, are left alone.
 */
export async function removeOtherVersions(cacheDir: string, executablePath: string) {
    const installed = path.relative(cacheDir, executablePath).split(path.sep)[0];
    for (const name of await readdir(cacheDir)) {
        if (name !== installed && !name.startsWith('.')) {
            await rm(path.join(cacheDir, name), { recursive: true, force: true });
        }
    }
}
