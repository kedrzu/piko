import { constants } from 'node:fs';
import type { Stats } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';

import { isErrorCode } from '../utils/isErrorCode.js';
import { areRealFolders } from './areRealFolders.js';

/** A file opened for reading after it was found a regular file; the caller closes `handle`. */
export interface OpenedRealFile {
    handle: FileHandle;
    stats: Stats;
}

/** Why `openRealFile()` refused a file that is there, for the caller to log. */
export type RealFileRefusal =
    /** The root or a folder on the way is a link or not a folder. */
    | 'notUnderRealFolders'
    /** A folder, a pipe, a device, a link found by `lstat`. */
    | 'notRegularFile'
    /** The file was swapped for a link between `lstat` and `open`. */
    | 'link';

/** How opening a file under a root ended. */
export type RealFileOpenResult = { opened: OpenedRealFile } | { missing: true } | { refused: RealFileRefusal };

/**
 * Opens a file without following a link in its last part (earlier parts are checked with `lstat` before), and without
 * waiting for a writer when a pipe took the file's place since its `lstat`.
 */
const OPEN_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

/**
 * Opens the file at `segments` (from `toPathSegments()`) under `root` for reading, never through a link: `root` and
 * every folder on the way must be real folders, and the file a regular file before it is opened, so a pipe or a device
 * is never opened. The agent can write anything under the data root, and a link it makes resolves on this computer.
 * @util
 */
export async function openRealFile(root: string, segments: readonly string[]): Promise<RealFileOpenResult> {
    if (!(await areRealFolders(root, segments.slice(0, -1)))) {
        return { refused: 'notUnderRealFolders' };
    }

    const file = path.join(root, ...segments);
    const linkStats = await lstat(file).catch((error: unknown) => {
        if (isErrorCode(error, 'ENOENT') || isErrorCode(error, 'ENOTDIR')) {
            return null;
        }
        throw error;
    });
    if (!linkStats) {
        return { missing: true };
    }
    if (!linkStats.isFile()) {
        return { refused: 'notRegularFile' };
    }

    let handle: FileHandle;
    try {
        handle = await open(file, OPEN_FLAGS);
    } catch (error) {
        // `ELOOP`: the file is a link.
        if (isErrorCode(error, 'ELOOP')) {
            return { refused: 'link' };
        }
        if (isErrorCode(error, 'ENOENT') || isErrorCode(error, 'ENOTDIR')) {
            return { missing: true };
        }
        throw error;
    }
    const stats = await handle.stat();
    if (!stats.isFile()) {
        await handle.close();
        return { refused: 'notRegularFile' };
    }
    return { opened: { handle, stats } };
}
