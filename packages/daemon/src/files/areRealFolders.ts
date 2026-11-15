import path from 'node:path';

import { isRealFolder } from '../utils/isRealFolder.js';

/**
 * Whether `root` and every folder on the way down `segments` (the last one included) are real folders, not links:
 * anything under the data root may be the agent's, and a link it makes resolves on this computer. Checked one by one
 * with `lstat`, so a link anywhere on the way is caught.
 * @util
 */
export async function areRealFolders(root: string, segments: readonly string[]) {
    let folder = root;
    if (!(await isRealFolder(folder))) {
        return false;
    }
    for (const segment of segments) {
        folder = path.join(folder, segment);
        if (!(await isRealFolder(folder))) {
            return false;
        }
    }
    return true;
}
