import { lstat } from 'node:fs/promises';

import { isErrorCode } from './isErrorCode.js';

/**
 * Whether `file` is a regular file itself, not a link; `false` when it does not exist.
 * @util
 */
export async function isRegularFile(file: string) {
    const stats = await lstat(file).catch((error: unknown) => {
        if (isErrorCode(error, 'ENOENT') || isErrorCode(error, 'ENOTDIR')) {
            return null;
        }
        throw error;
    });
    return stats?.isFile() ?? false;
}
