import type { FileHandle } from 'node:fs/promises';

/**
 * Reads at most `maxBytes` from the start of an open file: a file the agent wrote may be of any size, or still growing.
 * @util
 */
export async function readPrefix(handle: FileHandle, maxBytes: number) {
    const buffer = Buffer.alloc(maxBytes);
    let length = 0;
    while (length < maxBytes) {
        const { bytesRead } = await handle.read(buffer, length, maxBytes - length, length);
        if (bytesRead === 0) {
            break;
        }
        length += bytesRead;
    }
    return buffer.subarray(0, length);
}
