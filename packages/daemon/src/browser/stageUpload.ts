import { constants, createWriteStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { isErrorCode } from '../utils/isErrorCode.js';

/** A file the agent uploads, to copy where only the daemon can write. */
export interface StageUploadParams {
    /** The file in the data root, as `toHostUploadPath` mapped it. */
    source: string;
    /** The profile's data root on this computer. */
    dataRoot: string;
    /** The daemon's own staging folder (`browser-uploads` beside the browser profile), out of the agent's reach. */
    folder: string;
}

/**
 * `O_NOFOLLOW` refuses a link as the last segment; `O_NONBLOCK` keeps a FIFO from hanging the open (it is refused as a
 * non-regular file right after). Windows has neither flag and runs no agent browser, hence the fallback.
 */
const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

/**
 * Copies an upload into a fresh folder of its own under `folder`, keeping its name, and returns the copy's path: Chrome
 * reads an uploaded file when the page asks, long after the check, so it only ever gets a copy the agent cannot swap.
 * The source must be a regular file reached through no link at all: the file is opened first, then its path is checked
 * — its real path must be its lexical one under the real data root, and the entry there must still be the opened file —
 * so the bytes copied come from a file that sat at a link-free path inside the data root while it was open. Throws a
 * message fit for the agent when the source is refused.
 */
export async function stageUpload(params: StageUploadParams) {
    const { source, dataRoot, folder } = params;
    const handle = await openSource(source);
    try {
        const opened = await handle.stat();
        if (!opened.isFile()) {
            throw new Error('Only a regular file can be uploaded');
        }
        const expected = path.join(await realpath(dataRoot), path.relative(dataRoot, source));
        if ((await realpath(source)) !== expected) {
            throw new Error('A file reached through a link cannot be uploaded');
        }
        const current = await lstat(source);
        if (current.ino !== opened.ino || current.dev !== opened.dev) {
            throw new Error('The file was replaced while it was being uploaded');
        }

        await mkdir(folder, { recursive: true });
        const stagingFolder = await mkdtemp(path.join(folder, 'upload-'));
        const destination = path.join(stagingFolder, path.basename(source));
        try {
            await pipeline(
                handle.createReadStream({ start: 0, autoClose: false }),
                createWriteStream(destination, { flags: 'wx' }),
            );
        } catch (error) {
            await rm(stagingFolder, { recursive: true, force: true });
            throw error;
        }
        return destination;
    } finally {
        await handle.close();
    }
}

async function openSource(source: string) {
    try {
        return await open(source, OPEN_FLAGS);
    } catch (error) {
        if (isErrorCode(error, 'ELOOP')) {
            throw new Error('A file reached through a link cannot be uploaded', { cause: error });
        }
        if (isErrorCode(error, 'ENOENT') || isErrorCode(error, 'ENOTDIR')) {
            throw new Error('No such file', { cause: error });
        }
        throw error;
    }
}
