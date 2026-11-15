import path from 'node:path';

/**
 * A relative path under a folder of the data root split into its parts, or `null` when it could lead elsewhere or to a
 * hidden entry: absolute, with a NUL, or with an empty, `.`, `..` or hidden part (an empty path too). Both separators
 * split it, so a Windows path is checked the same way.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function toPathSegments(relativePath: string) {
    if (relativePath.includes('\0') || path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
        return null;
    }
    const segments = relativePath.split(/[\\/]/);
    if (segments.some(segment => segment.length === 0 || segment.startsWith('.'))) {
        return null;
    }
    return segments;
}
