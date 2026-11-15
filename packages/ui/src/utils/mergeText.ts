import { diff3Merge } from 'node-diff3';

/** The three texts of a three-way merge. */
export interface MergeTextParams {
    /** The text both sides started from: what was last read or written. */
    base: string;
    /** The person's text. */
    mine: string;
    /** The text changed elsewhere meanwhile (on disk, by the agent). */
    theirs: string;
}

/**
 * Merges two edits of the same text line by line: changes to different lines both survive, the same change made on
 * both sides counts once. Changes to the same or adjacent lines are a conflict, and nothing is merged.
 * @returns The merged text, or `null` on a conflict.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function mergeText({ base, mine, theirs }: MergeTextParams): string | null {
    const lines: string[] = [];
    for (const block of diff3Merge(mine.split('\n'), base.split('\n'), theirs.split('\n'))) {
        if (block.conflict) {
            return null;
        }
        lines.push(...(block.ok ?? []));
    }
    return lines.join('\n');
}
