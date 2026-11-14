import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';

/**
 * Writes `content` to `file` atomically, in a folder the agent can write to: to a new file beside it, then renamed over
 * it. A reader never sees half a file, and a file swapped for a link since it was read is replaced, not followed to the
 * file it points at. The caller checks that the folder is a real one.
 * @util
 */
export async function replaceFile(file: string, content: string) {
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
        await writeFile(temp, content, { flag: 'wx' });
        await rename(temp, file);
    } catch (error) {
        await rm(temp, { force: true });
        throw error;
    }
}
