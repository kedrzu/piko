import { constants } from 'node:fs';
import { copyFile, mkdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';

import { isErrorCode } from '../utils/isErrorCode.js';
import { isRealFolder } from '../utils/isRealFolder.js';

/** A finished download to hand over to the person's Downloads folder. */
export interface MoveDownloadParams {
    /** The file the browser wrote, in the daemon's own folder. */
    source: string;
    /** The data root's Downloads folder; the agent can replace it, so it is checked before every move. */
    folder: string;
    /** The name the page suggested; it is the page's to choose, so it is sanitized. */
    suggestedName: string;
}

/** The name given to a download whose suggested name has nothing left after sanitizing. */
const FALLBACK_NAME = 'download';

/** How many `name (n).ext` variants are tried before the move gives up. */
const MAX_SUFFIX = 1000;

/**
 * Moves a finished download into the Downloads folder under its sanitized suggested name, `name (2).ext` and onwards
 * when it is taken. It never writes through a link: the folder must be a real folder (`isRealFolder`), and the copy
 * refuses any existing entry at the destination, a link included. Returns the destination, or `null` when the folder
 * is not a real folder (the source is then left in place). The folder check and the copy are separate steps, so the
 * agent can swap the folder for a link between them; after the copy the file's real parent is verified, and a file
 * that landed elsewhere is unlinked and reported as an error.
 */
export async function moveDownload(params: MoveDownloadParams) {
    const { source, folder } = params;
    await mkdir(folder, { recursive: true });
    if (!(await isRealFolder(folder))) {
        return null;
    }

    const name = sanitizeName(params.suggestedName);
    const extension = path.extname(name);
    const stem = name.slice(0, name.length - extension.length);
    for (let attempt = 1; attempt <= MAX_SUFFIX; attempt++) {
        const destination = path.join(folder, attempt === 1 ? name : `${stem} (${attempt})${extension}`);
        try {
            // EXCL fails on any existing entry, a dangling link too, so nothing is overwritten or written through.
            await copyFile(source, destination, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
        } catch (error) {
            if (isErrorCode(error, 'EEXIST')) {
                continue;
            }
            throw error;
        }
        if (!(await isInsideFolder(destination, folder))) {
            // rm unlinks the path itself and never follows a link at the destination name.
            await rm(destination, { force: true });
            throw new Error('The Downloads folder was replaced during the move, the file was removed');
        }
        await rm(source, { force: true });
        return destination;
    }
    throw new Error(`No free name for the download after ${MAX_SUFFIX} attempts`);
}

/** Whether the real parent of `file` is the Downloads `folder` itself, a direct child of its real data root. */
export async function isInsideFolder(file: string, folder: string) {
    const expected = path.join(await realpath(path.dirname(folder)), path.basename(folder));
    return (await realpath(path.dirname(file))) === expected;
}

/** A file name with no folder part, no leading dot (no hidden or `..` names) and no control characters. */
function sanitizeName(suggested: string) {
    let replaced = '';
    for (const char of suggested) {
        replaced += isForbiddenChar(char) ? '_' : char;
    }
    const cleaned = replaced.replace(/^[.\s]+/, '').trim();
    return cleaned === '' ? FALLBACK_NAME : cleaned;
}

function isForbiddenChar(char: string) {
    const code = char.codePointAt(0) ?? 0;
    return char === '/' || char === '\\' || code < 0x20 || code === 0x7f;
}
