import { fileExtension } from './fileExtension.js';

/**
 * Documents a project file may be opened as, in its default app on the person's computer. The agent can write any file
 * into a project, and opening an app, a script or an installer (`.app`, `.command`, `.sh`, `.pkg`) would run it outside
 * the sandbox; so only document types open, the ones the app itself cannot show or edit.
 */
const OPENABLE_EXTENSIONS = new Set([
    // Text and Markdown
    'md',
    'markdown',
    'txt',
    'csv',
    'tsv',
    'rtf',
    // Office and iWork documents
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'odt',
    'ods',
    'odp',
    'pages',
    'numbers',
    'key',
    // PDF and images
    'pdf',
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'heic',
    'tif',
    'tiff',
    'bmp',
    // Audio and video
    'mp3',
    'm4a',
    'wav',
    'mp4',
    'mov',
    'm4v',
]);

/**
 * Whether a project file may be opened in its default app: a document by its name's extension, never an app, a script
 * or an installer the agent could have written there.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function isOpenableFile(name: string): boolean {
    return OPENABLE_EXTENSIONS.has(fileExtension(name));
}
