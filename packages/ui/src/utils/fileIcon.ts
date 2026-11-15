import { File, FileText, Image, Sheet } from '@lucide/vue';
import type { LucideIcon } from '@lucide/vue';
import { assertNever } from '@nzyme/utils/assertNever.js';

/** What a file is to the person, by its icon: a note, a spreadsheet, an image or another file. */
export type FileIconKind = 'note' | 'spreadsheet' | 'image' | 'file';

/**
 * The icon a file of the kind shows, wherever a file is named (a sidebar row, a chip, the side view's bar).
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function fileIcon(kind: FileIconKind): LucideIcon {
    switch (kind) {
        case 'note':
            return FileText;
        case 'spreadsheet':
            return Sheet;
        case 'image':
            return Image;
        case 'file':
            return File;
        default:
            return assertNever(kind);
    }
}
