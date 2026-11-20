import { createHash, randomUUID } from 'node:crypto';
import type { Stats } from 'node:fs';
import { lstat, open, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { assert } from '@nzyme/utils/assert.js';
import { assertNever } from '@nzyme/utils/assertNever.js';

import type {
    ProjectFileContentResult,
    ProjectFileEntry,
    ProjectFileInput,
    ProjectFileListInput,
    ProjectFileListResult,
    ProjectFileLocateResult,
    ProjectFileReadResult,
    ProjectFileWriteInput,
    ProjectFileWriteResult,
} from '@piko/common/api/ProjectFileTypes.js';

import { PIKO_DATA_ROOT, PROJECTS_FOLDER } from '../env.js';
import { areRealFolders } from '../files/areRealFolders.js';
import { FileTypingService } from '../files/FileTypingService.js';
import { openRealFile } from '../files/openRealFile.js';
import type { OpenedRealFile } from '../files/openRealFile.js';
import { readPrefix } from '../files/readPrefix.js';
import { toPathSegments } from '../files/toPathSegments.js';
import { isErrorCode } from '../utils/isErrorCode.js';
import { isRegularFile } from '../utils/isRegularFile.js';
import { ProjectService } from './ProjectService.js';

/**
 * The files of a project's folder, for the person to browse, read and edit in the app. The agent can write anything in
 * a project, links included, and a link it makes resolves on this computer, not in the sandbox: so nothing is listed,
 * read, written or located through a link (the file itself or a folder on the way, the projects' and the project's
 * folder included) or outside the project's folder, and no hidden entry is ever touched. Only regular files are opened
 * (never a pipe or a device), and only a bounded part of one is read.
 */
export interface ProjectFileServiceShape {
    /** The entries of one folder of the project, without hidden entries and links. */
    list(input: ProjectFileListInput): Promise<ProjectFileListResult>;
    read(input: ProjectFileInput): Promise<ProjectFileReadResult>;
    content(input: ProjectFileInput): Promise<ProjectFileContentResult>;
    locate(input: ProjectFileInput): Promise<ProjectFileLocateResult>;
    /**
     * Replaces an existing text file's content, unless its version is no longer the given one. Atomic: written to a
     * hidden file beside it and renamed over it, so the file is never seen half-written, and a link swapped in for it
     * is replaced, not followed. Refuses content over 1 MiB, the largest text `read()` gives. A write is the person
     * typing (`FileTypingService`).
     */
    write(input: ProjectFileWriteInput): Promise<ProjectFileWriteResult>;
}

/** What reading a file opened as text gives. */
type TextReadResult = Exclude<ProjectFileReadResult, { notFound: true }>;

/** Lower case. */
const TEXT_EXTENSIONS: readonly string[] = ['.md', '.markdown', '.txt', '.csv'];
/** The largest text file read or written. */
const TEXT_MAX_BYTES = 1024 * 1024;
/** The largest file whose bytes `content()` gives. */
const CONTENT_MAX_BYTES = 25 * 1024 * 1024;
/** The permission bits of a file's mode, which a write keeps. */
const PERMISSION_BITS = 0o777;

/** The files of the person's projects, under the data root's `PROJECTS_FOLDER`. */
export const ProjectFileService = defineService({
    name: 'ProjectFileService',
    deps: { logger: Logger, dataRoot: PIKO_DATA_ROOT, projects: ProjectService, typing: FileTypingService },
    setup({ logger, dataRoot, projects, typing }): ProjectFileServiceShape {
        // Every path is checked from here: the projects' folder, the project's folder and each folder below must be
        // real folders.
        const root = path.resolve(dataRoot, PROJECTS_FOLDER);
        const utf8 = new TextDecoder('utf-8', { fatal: true });

        return { list, read, content, locate, write };

        async function list(input: ProjectFileListInput): Promise<ProjectFileListResult> {
            const segments = await resolve(input.projectId, input.path ?? '');
            if (!segments) {
                return { notFound: true };
            }
            if (!(await areRealFolders(root, segments))) {
                logger.warn('Project folder missing or not a real folder, not listed', {
                    projectId: input.projectId,
                    path: input.path,
                });
                return { notFound: true };
            }
            const dir = path.join(root, ...segments);
            const names = await readdir(dir).catch((error: unknown) => {
                if (isErrorCode(error, 'ENOENT') || isErrorCode(error, 'ENOTDIR')) {
                    return null;
                }
                throw error;
            });
            if (!names) {
                return { notFound: true };
            }

            const entries: ProjectFileEntry[] = [];
            const folderPath = segments.slice(1);
            for (const name of names) {
                if (name.startsWith('.')) {
                    continue;
                }
                const entry = await toEntry(path.join(dir, name), [...folderPath, name]);
                if (entry) {
                    entries.push(entry);
                }
            }
            return { entries: entries.toSorted(compareEntries) };
        }

        async function read(input: ProjectFileInput): Promise<ProjectFileReadResult> {
            const opened = await openFile(input);
            if (!opened) {
                return { notFound: true };
            }
            try {
                if (!isTextName(input.path)) {
                    return { binary: { size: opened.stats.size, updatedAt: Math.round(opened.stats.mtimeMs) } };
                }
                return await readText(opened);
            } finally {
                await opened.handle.close();
            }
        }

        async function content(input: ProjectFileInput): Promise<ProjectFileContentResult> {
            const opened = await openFile(input);
            if (!opened) {
                return { notFound: true };
            }
            try {
                // One byte over the limit tells a file at the limit from a larger one, also one growing since `stat`.
                const bytes = await readPrefix(opened.handle, CONTENT_MAX_BYTES + 1);
                if (bytes.length > CONTENT_MAX_BYTES) {
                    logger.warn('Project file too large, content not read', {
                        projectId: input.projectId,
                        path: input.path,
                        size: opened.stats.size,
                    });
                    return { tooLarge: true };
                }
                return { base64: bytes.toString('base64'), size: bytes.length };
            } finally {
                await opened.handle.close();
            }
        }

        async function locate(input: ProjectFileInput): Promise<ProjectFileLocateResult> {
            const segments = await resolve(input.projectId, input.path);
            const opened = segments && (await openSegments(input, segments));
            if (!segments || !opened) {
                return { notFound: true };
            }
            await opened.handle.close();
            return { path: path.join(root, ...segments) };
        }

        async function write(input: ProjectFileWriteInput): Promise<ProjectFileWriteResult> {
            const segments = await resolve(input.projectId, input.path);
            if (!segments || !isTextName(input.path)) {
                return { notFound: true };
            }
            const opened = await openSegments(input, segments);
            if (!opened) {
                return { notFound: true };
            }
            let current: TextReadResult;
            try {
                current = await readText(opened);
            } finally {
                await opened.handle.close();
            }
            if (!('text' in current)) {
                logger.warn('Project file is not a text file, not written', {
                    projectId: input.projectId,
                    path: input.path,
                });
                return { notFound: true };
            }
            const bytes = Buffer.from(input.content, 'utf8');
            if (bytes.length > TEXT_MAX_BYTES) {
                logger.warn('Project file content too large, not written', {
                    projectId: input.projectId,
                    path: input.path,
                    size: bytes.length,
                });
                return { tooLarge: true };
            }
            if (current.text.version !== input.version) {
                logger.info('Project file changed since read, not written', {
                    projectId: input.projectId,
                    path: input.path,
                });
                return { stale: current.text };
            }

            const written = await replaceFile(segments, bytes, opened.stats.mode & PERMISSION_BITS);
            if (!written) {
                logger.warn('Project file changed while written, not written', {
                    projectId: input.projectId,
                    path: input.path,
                });
                return { notFound: true };
            }
            logger.info('Project file written', { projectId: input.projectId, path: input.path, size: bytes.length });
            // The person is typing in it: the agent's change to it waits (`FileHoldService`).
            typing.noteWrite({ projectId: input.projectId, path: input.path });
            return { written: { version: toVersion(bytes), updatedAt: Math.round(written.mtimeMs) } };
        }

        /**
         * The segments of a path in a project under the projects' folder (the project's folder first), or `null` when
         * there is no such project or the path is refused by `toPathSegments()`. An empty path is the project's folder.
         */
        async function resolve(projectId: string, relativePath: string) {
            const project = await projects.get(projectId);
            if (!project) {
                logger.warn('Project not found, file refused', { projectId });
                return null;
            }
            // `ProjectService` lists only folders directly inside the projects' folder; checked, as everything here
            // relies on it.
            if (path.dirname(project.dir) !== root) {
                logger.warn('Project folder outside the projects folder, file refused', { projectId });
                return null;
            }
            const folder = path.basename(project.dir);
            if (relativePath === '') {
                return [folder];
            }
            const segments = toPathSegments(relativePath);
            if (!segments) {
                logger.warn('Project file path refused', { projectId, path: relativePath });
                return null;
            }
            return [folder, ...segments];
        }

        async function openFile(input: ProjectFileInput) {
            const segments = await resolve(input.projectId, input.path);
            return segments && (await openSegments(input, segments));
        }

        /** Opens the file at `segments` with `openRealFile()`, or `null` when it is missing or refused. */
        async function openSegments(input: ProjectFileInput, segments: string[]): Promise<OpenedRealFile | null> {
            // The project's folder itself is not a file.
            if (segments.length < 2) {
                return null;
            }
            const result = await openRealFile(root, segments);
            if ('opened' in result) {
                return result.opened;
            }
            if ('refused' in result) {
                const fields = { projectId: input.projectId, path: input.path };
                switch (result.refused) {
                    case 'notUnderRealFolders':
                        logger.warn('Project file not under real folders, refused', fields);
                        break;
                    case 'notRegularFile':
                        logger.warn('Project file is not a regular file, refused', fields);
                        break;
                    case 'link':
                        logger.warn('Project file is a link, refused', fields);
                        break;
                    default:
                        assertNever(result.refused);
                }
            }
            return null;
        }

        /** Reads an opened file as text: valid UTF-8 without a NUL byte, up to `TEXT_MAX_BYTES`. */
        async function readText(opened: OpenedRealFile): Promise<TextReadResult> {
            const updatedAt = Math.round(opened.stats.mtimeMs);
            const bytes = await readPrefix(opened.handle, TEXT_MAX_BYTES + 1);
            if (bytes.length > TEXT_MAX_BYTES) {
                return { tooLarge: true };
            }
            const text = bytes.includes(0) ? null : decode(bytes);
            if (text === null) {
                return { binary: { size: bytes.length, updatedAt } };
            }
            return { text: { content: text, version: toVersion(bytes), updatedAt } };
        }

        function decode(bytes: Buffer) {
            try {
                return utf8.decode(bytes);
            } catch {
                return null;
            }
        }

        /**
         * Replaces the file at `segments` with `bytes`, through a hidden temporary file beside it (created only if no
         * entry has its name, a link included) renamed over it. The folders are checked again right before, and the
         * target must still be a regular file, so a write never creates a file or goes through a link swapped in since
         * the read. The temporary file never stays behind. The written file's stats, or `null` when refused.
         */
        async function replaceFile(segments: string[], bytes: Buffer, mode: number): Promise<Stats | null> {
            const folderSegments = segments.slice(0, -1);
            const name = segments.at(-1);
            assert(name, 'A file path has a name');
            const dir = path.join(root, ...folderSegments);
            const target = path.join(dir, name);
            const temp = path.join(dir, `.${name}.${randomUUID()}.tmp`);
            if (!(await areRealFolders(root, folderSegments))) {
                return null;
            }

            let created = false;
            let renamed = false;
            try {
                // `wx`: fails on any existing entry, a link included, so nothing else is ever written to.
                const handle = await open(temp, 'wx', mode);
                created = true;
                let stats: Stats;
                try {
                    await handle.writeFile(bytes);
                    // The creation mode is narrowed by the umask: set again to keep the file's.
                    await handle.chmod(mode);
                    await handle.sync();
                    stats = await handle.stat();
                } finally {
                    await handle.close();
                }

                if (!(await areRealFolders(root, folderSegments)) || !(await isRegularFile(target))) {
                    return null;
                }
                await rename(temp, target);
                renamed = true;
                return stats;
            } finally {
                if (created && !renamed) {
                    await rm(temp, { force: true });
                }
            }
        }

        /** The entry for `file`, or `null` for a link, a pipe or anything but a folder or a regular file. */
        async function toEntry(file: string, entrySegments: string[]): Promise<ProjectFileEntry | null> {
            // `lstat`: a link is seen as a link, never followed.
            const stats = await lstat(file).catch((error: unknown) => {
                // Gone since the folder was read: not listed, quietly.
                if (!isErrorCode(error, 'ENOENT')) {
                    logger.warn('Project file unreadable, not listed', { path: entrySegments.join('/'), error });
                }
                return null;
            });
            if (!stats || !(stats.isDirectory() || stats.isFile())) {
                return null;
            }
            return {
                name: path.basename(file),
                path: entrySegments.join('/'),
                kind: stats.isDirectory() ? 'folder' : 'file',
                updatedAt: Math.round(stats.mtimeMs),
                size: stats.isDirectory() ? 0 : stats.size,
            };
        }
    },
});

/** @__NO_SIDE_EFFECTS__ */
function isTextName(filePath: string) {
    const name = filePath.toLowerCase();
    return TEXT_EXTENSIONS.some(extension => name.endsWith(extension));
}

/**
 * A file's version: the SHA-256 of its bytes, in hex.
 * @__NO_SIDE_EFFECTS__
 */
function toVersion(bytes: Buffer) {
    return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Folders before files, then by name.
 * @__NO_SIDE_EFFECTS__
 */
function compareEntries(a: ProjectFileEntry, b: ProjectFileEntry) {
    if (a.kind !== b.kind) {
        return a.kind === 'folder' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
}
