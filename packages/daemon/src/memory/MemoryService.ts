import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { assertNever } from '@nzyme/utils/assertNever.js';

import type { MemoryFile, MemoryFileGetResult } from '@poweragents/common/api/MemoryTypes.js';

import { MEMORY_FOLDER, POWERAGENTS_DATA_ROOT } from '../env.js';
import { openRealFile } from '../files/openRealFile.js';
import type { OpenedRealFile } from '../files/openRealFile.js';
import { readPrefix } from '../files/readPrefix.js';
import { toPathSegments } from '../files/toPathSegments.js';
import { isErrorCode } from '../utils/isErrorCode.js';
import { isRealFolder } from '../utils/isRealFolder.js';

/**
 * The person's Memory (design D9): Markdown files in the data root's `MEMORY_FOLDER`, written by the agent. The agent
 * can write anything there, links included, and a link it makes resolves on this computer, not in the sandbox: so a
 * file is read only through real folders, never through a link, and never from a hidden file or folder. Only regular
 * files are opened (never a pipe or a device), and only a bounded part of one is read.
 */
export interface MemoryServiceShape {
    /** Creates the Memory folder when it is missing; the daemon calls it at start. */
    ensureFolder(): Promise<void>;
    /** Every Markdown file in the Memory folder and its subfolders, sorted by path. */
    list(): Promise<MemoryFile[]>;
    /** One Markdown file by its path relative to the Memory folder, as `list()` gives it. */
    get(relativePath: string): Promise<MemoryFileGetResult>;
    /**
     * The absolute path of a Memory file (by its listed path) or, without one, of the Memory folder, checked under the
     * same rules as `get()`; `null` when there is no such file or folder.
     */
    locate(relativePath?: string): Promise<string | null>;
}

/** What a safe read of a Memory file gives. */
interface MemoryFileRead {
    content: string;
    updatedAt: number;
}

const MARKDOWN_EXTENSION = '.md';
/** A Markdown heading (`# Title`, `## Title ##`): its text without the closing hashes. */
const HEADING = /^#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
/** The largest file `get()` reads. */
const GET_MAX_BYTES = 1024 * 1024;
/** How much of a file `list()` reads for its title. */
const TITLE_PREFIX_BYTES = 4096;

/** The person's Memory folder. */
export const MemoryService = defineService({
    name: 'MemoryService',
    deps: { logger: Logger, dataRoot: POWERAGENTS_DATA_ROOT },
    setup({ logger, dataRoot }): MemoryServiceShape {
        const root = path.resolve(dataRoot, MEMORY_FOLDER);

        return { ensureFolder, list, get, locate };

        async function ensureFolder() {
            const created = await mkdir(root, { recursive: true });
            if (created !== undefined) {
                logger.info('Memory folder created');
            }
        }

        async function list() {
            const files: MemoryFile[] = [];
            if (!(await isRealFolder(root))) {
                logger.warn('Memory folder missing or not a folder, nothing listed');
                return files;
            }
            await collect([], files);
            return files.toSorted((a, b) => a.path.localeCompare(b.path));
        }

        async function get(relativePath: string): Promise<MemoryFileGetResult> {
            const segments = toSegments(relativePath);
            if (!segments) {
                logger.warn('Memory file path refused', { path: relativePath });
                return { notFound: true };
            }
            const opened = await openFile(segments);
            if (!opened) {
                return { notFound: true };
            }
            try {
                // One byte over the limit tells a file at the limit from a larger one, also one growing since `stat`.
                const bytes = await readPrefix(opened.handle, GET_MAX_BYTES + 1);
                if (bytes.length > GET_MAX_BYTES) {
                    logger.warn('Memory file too large, not read', {
                        path: segments.join('/'),
                        size: opened.stats.size,
                    });
                    return { tooLarge: true };
                }
                const read: MemoryFileRead = { content: bytes.toString('utf8'), updatedAt: opened.stats.mtimeMs };
                return { file: { ...toMemoryFile(segments, read), content: read.content } };
            } finally {
                await opened.handle.close();
            }
        }

        async function locate(relativePath?: string) {
            if (relativePath === undefined) {
                return (await isRealFolder(root)) ? root : null;
            }
            const segments = toSegments(relativePath);
            if (!segments) {
                logger.warn('Memory file path refused', { path: relativePath });
                return null;
            }
            const opened = await openFile(segments);
            if (!opened) {
                return null;
            }
            await opened.handle.close();
            return path.join(root, ...segments);
        }

        /**
         * Adds the Markdown files of the folder at `segments` and its subfolders to `files`; links are skipped, and so is
         * a folder removed while the listing runs, and an entry the daemon cannot read: one bad entry must not fail the
         * whole listing.
         */
        async function collect(segments: string[], files: MemoryFile[]) {
            const entries = await readdir(path.join(root, ...segments), { withFileTypes: true }).catch(
                (error: unknown) => {
                    if (isErrorCode(error, 'ENOENT') || isErrorCode(error, 'ENOTDIR')) {
                        logger.debug('Memory folder gone while listed, skipped', { path: segments.join('/') });
                        return [];
                    }
                    logger.warn('Memory folder unreadable, skipped', { path: segments.join('/'), error });
                    return [];
                },
            );
            for (const entry of entries) {
                if (entry.name.startsWith('.')) {
                    continue;
                }
                const entrySegments = [...segments, entry.name];
                if (entry.isDirectory()) {
                    await collect(entrySegments, files);
                } else if (entry.isFile() && isMarkdown(entry.name)) {
                    const read = await readTitleSource(entrySegments).catch((error: unknown) => {
                        logger.warn('Memory file unreadable, skipped', { path: entrySegments.join('/'), error });
                        return null;
                    });
                    if (read) {
                        files.push(toMemoryFile(entrySegments, read));
                    }
                }
            }
        }

        /** The start of the file at `segments`, enough for its title, or `null` when `openFile()` refuses it. */
        async function readTitleSource(segments: string[]): Promise<MemoryFileRead | null> {
            const opened = await openFile(segments);
            if (!opened) {
                return null;
            }
            try {
                const bytes = await readPrefix(opened.handle, TITLE_PREFIX_BYTES);
                let content = bytes.toString('utf8');
                if (bytes.length === TITLE_PREFIX_BYTES) {
                    // The last line may be cut, mid-heading or mid-character: dropped.
                    content = content.slice(0, Math.max(content.lastIndexOf('\n'), 0));
                }
                return { content, updatedAt: opened.stats.mtimeMs };
            } finally {
                await opened.handle.close();
            }
        }

        /**
         * Opens the file at `segments` under the Memory folder with `openRealFile()`, or `null` when it is missing or
         * refused (reached through a link, not a regular file).
         */
        async function openFile(segments: string[]): Promise<OpenedRealFile | null> {
            const result = await openRealFile(root, segments);
            if ('opened' in result) {
                return result.opened;
            }
            if ('refused' in result) {
                switch (result.refused) {
                    case 'notUnderRealFolders':
                        logger.warn('Memory file not under real folders, refused', { path: segments.join('/') });
                        break;
                    case 'notRegularFile':
                        logger.warn('Memory file is not a regular file, refused', { path: segments.join('/') });
                        break;
                    case 'link':
                        logger.warn('Memory file is a link, refused', { path: segments.join('/') });
                        break;
                    default:
                        assertNever(result.refused);
                }
            }
            return null;
        }
    },
});

/**
 * A relative Memory path split into its parts, or `null` when `toPathSegments()` refuses it or it leads to a file
 * `list()` never gives: one that is not Markdown.
 * @__NO_SIDE_EFFECTS__
 */
function toSegments(relativePath: string) {
    const segments = toPathSegments(relativePath);
    return segments && isMarkdown(segments.at(-1) ?? '') ? segments : null;
}

/** @__NO_SIDE_EFFECTS__ */
function isMarkdown(name: string) {
    return name.toLowerCase().endsWith(MARKDOWN_EXTENSION);
}

/** @__NO_SIDE_EFFECTS__ */
function toMemoryFile(segments: string[], read: MemoryFileRead): MemoryFile {
    const name = segments.at(-1) ?? '';
    return {
        path: segments.join('/'),
        title: readTitle(read.content) ?? name.slice(0, -MARKDOWN_EXTENSION.length),
        updatedAt: Math.round(read.updatedAt),
    };
}

/**
 * The text of the first Markdown heading, if any.
 * @__NO_SIDE_EFFECTS__
 */
function readTitle(content: string) {
    for (const line of content.split('\n')) {
        const title = HEADING.exec(line.trimEnd())?.[1]?.trim();
        if (title) {
            return title;
        }
    }
    return undefined;
}
