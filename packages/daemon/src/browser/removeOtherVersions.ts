import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

/** Prefix of what an install in progress keeps in the cache folder; the package removes a failed install's leftovers. */
const TEMP_PREFIX = '.install-';

/**
 * Removes every installed Chrome for Testing version in `cacheDir` but the one `executablePath` lies in: the daemon
 * owns its cache, and a version it no longer launches only takes space. An install in progress is left alone.
 */
export async function removeOtherVersions(cacheDir: string, executablePath: string) {
    const installed = path.relative(cacheDir, executablePath).split(path.sep)[0];
    for (const name of await readdir(cacheDir)) {
        if (name !== installed && !name.startsWith(TEMP_PREFIX)) {
            await rm(path.join(cacheDir, name), { recursive: true, force: true });
        }
    }
}
