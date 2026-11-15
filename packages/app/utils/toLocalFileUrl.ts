import { convertFileSrc, isTauri } from '@tauri-apps/api/core';

/**
 * A URL the page loads a file on this computer from, by its absolute path: the shell's asset protocol in the desktop
 * app, `undefined` in a plain browser (dev, e2e), where the caller reads the file's bytes from the daemon instead. The
 * asset protocol serves only what the shell's config allows; a file it refuses fails to load, and the caller falls back
 * to the bytes then too.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function toLocalFileUrl(absolutePath: string): string | undefined {
    return isTauri() ? convertFileSrc(absolutePath) : undefined;
}
