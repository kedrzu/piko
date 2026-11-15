import { parseMarkdown, serializeMarkdown } from './markdownDocument.js';
import { mergeText } from './mergeText.js';
import type { MergeTextParams } from './mergeText.js';

/**
 * Merges two edits of a Markdown file (`mergeText`), all three texts first written the way the editor writes them:
 * the editor rewrites the whole file on the person's first keystroke, and that rewrite is not their change.
 * @returns The merged text, in the editor's form, or `null` on a conflict.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function mergeMarkdown({ base, mine, theirs }: MergeTextParams): string | null {
    return mergeText({ base: normalise(base), mine: normalise(mine), theirs: normalise(theirs) });
}

/** @__NO_SIDE_EFFECTS__ */
function normalise(markdown: string) {
    return serializeMarkdown(parseMarkdown(markdown));
}
