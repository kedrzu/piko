import { fileExtension } from '@poweragents/common/utils/fileExtension.js';

/** What a project file is to the person, by its extension: what icon it shows. */
export type FileKind = 'note' | 'spreadsheet' | 'image' | 'file';

const NOTE_EXTENSIONS = new Set(['md', 'markdown', 'txt']);
const SPREADSHEET_EXTENSIONS = new Set(['csv', 'tsv', 'xls', 'xlsx', 'numbers', 'ods']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg', 'bmp', 'tif', 'tiff']);

/**
 * What a project file is, by its name's extension: a note (Markdown or text), a spreadsheet, an image, or another file.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function fileKind(path: string): FileKind {
    const extension = fileExtension(path);
    if (NOTE_EXTENSIONS.has(extension)) {
        return 'note';
    }
    if (SPREADSHEET_EXTENSIONS.has(extension)) {
        return 'spreadsheet';
    }
    return IMAGE_EXTENSIONS.has(extension) ? 'image' : 'file';
}
