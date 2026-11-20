import type { ConversationStepKind } from '@piko/common/api/ConversationTypes.js';
import { readString } from '@piko/common/utils/readString.js';

/** The names a tool may give the file it writes: OpenCode's own, then Claude Code's. */
const PATH_KEYS = ['path', 'filePath', 'file_path'];
/**
 * A file header of a patch in OpenCode's (and Codex's) format: `*** Add File: <path>`, `*** Update File: <path>`,
 * `*** Delete File: <path>`, and `*** Move to: <path>` for the new name of a file updated.
 */
const PATCH_HEADER = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm;

/**
 * The files a tool call writes, as the agent gave them: absolute in its container, or relative to the session's folder.
 * A step that writes or edits a file names it in its arguments, or, for OpenCode's `apply_patch`, in the headers of the
 * patch, which may touch several files. None for any other step.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function readWrittenPaths(kind: ConversationStepKind, input: Record<string, unknown>): string[] {
    if (kind !== 'writeFile' && kind !== 'editFile') {
        return [];
    }
    for (const key of PATH_KEYS) {
        const file = readString(input, key);
        if (file) {
            return [file];
        }
    }
    const patch = readString(input, 'patchText') ?? readString(input, 'patch');
    if (!patch) {
        return [];
    }
    const files = new Set<string>();
    for (const match of patch.matchAll(PATCH_HEADER)) {
        const file = match[1]?.trim();
        if (file) {
            files.add(file);
        }
    }
    return [...files];
}
