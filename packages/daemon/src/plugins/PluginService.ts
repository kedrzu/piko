import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { HttpError } from '@nzyme/fetch-utils/HttpError.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { assert } from '@nzyme/utils/assert.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';

import type { PluginsChangedEvent } from '@poweragents/common/api/DaemonEventTypes.js';
import type { PluginInfo, PluginInstall } from '@poweragents/common/api/PluginTypes.js';

import { DAEMON_FOLDER, POWERAGENTS_DATA_ROOT } from '../env.js';
import { ProjectService } from '../projects/ProjectService.js';
import { isErrorCode } from '../utils/isErrorCode.js';
import { isRealFolder } from '../utils/isRealFolder.js';
import { PluginCatalog } from './PluginCatalog.js';
import type { LocalPlugin } from './PluginCatalog.js';
import { PLUGIN_NAME_PATTERN } from './parsePluginManifest.js';

/** A plugin to install or remove: a `profile` plugin without a project, a `project` plugin in one project. */
export interface PluginInstallParams {
    name: string;
    projectId?: string;
}

/** What an installation did. */
export interface PluginInstallResult {
    /** The plugin, with its `plugin.json`: what applying its environment needs. */
    plugin: LocalPlugin;
    /**
     * Whether the installation was recorded now; `false` for one recorded already, and for an own plugin, which is
     * installed by its folder being there.
     */
    added: boolean;
}

/**
 * The installed plugins and the daemon's folder in the data root (`DAEMON_FOLDER`): the manifest `plugins.json`, which
 * records each installation of a bundled plugin, and the copies the sandbox reads, `plugins/<name>/` for each installed
 * bundled plugin and `skills/<plugin>:<skill>/` for each skill of an installed plugin, bundled or own. The daemon
 * writes there only through real folders, never through a link; a folder of it replaced by one is refused. Changes run
 * one at a time.
 *
 * Failures a caller passes on throw an `HttpError`: 404 `PluginNotFound`, 409 `PluginInvalid` (a plugin with errors),
 * 400 `PluginLevelMismatch` (a `profile` plugin with a project, a `project` one without), 404 `ProjectNotFound`, 404
 * `PluginNotInstalled`.
 */
export interface PluginServiceShape {
    /** Every plugin of the catalog with where it is installed. A missing or unreadable manifest is no installations. */
    list(): Promise<PluginInfo[]>;
    /** Records an installation and syncs the daemon's folder; installing what is installed already changes nothing. */
    install(params: PluginInstallParams): Promise<PluginInstallResult>;
    /**
     * Removes one installation of a bundled plugin and syncs the daemon's folder. Nothing but the manifest entry and the
     * copies goes: an own plugin is removed by deleting its folder.
     */
    remove(params: PluginInstallParams): Promise<void>;
    /**
     * Makes the daemon's `plugins/` and `skills/` hold exactly the copies of what is installed, so an own plugin's
     * changed skill reaches the agent at the next sync. Returns whether anything changed.
     */
    sync(): Promise<boolean>;
    /** Calls `listener` after every installation and removal, until the returned function is called. */
    listen(listener: (event: PluginsChangedEvent) => void): () => void;
}

/** One installation in `plugins.json`. */
interface InstalledPlugin {
    name: string;
    /** The project of a `project` plugin; absent for a `profile` one. */
    projectId?: string;
}

/** A file's content, a folder, or anything else (a link, say), which a copy leaves out. */
type TreeEntry = Buffer | 'folder' | 'other';

/** The entries under a folder by their path relative to it, a folder before what it holds. */
type Tree = Map<string, TreeEntry>;

const MANIFEST_FILE = 'plugins.json';
const COPIES_FOLDER = 'plugins';
const SKILLS_FOLDER = 'skills';
/** The manifest holds a few names and ids; anything larger is not one. */
const MANIFEST_MAX_BYTES = 1024 * 1024;
/** A copied plugin or skill is a few texts and scripts: a larger one is refused rather than copied on every sync. */
const COPY_MAX_BYTES = 16 * 1024 * 1024;
const COPY_MAX_ENTRIES = 1000;

/** The plugins installed in the profile and its projects, and the daemon's copies of them for the sandbox. */
export const PluginService = defineService({
    name: 'PluginService',
    deps: { logger: Logger, dataRoot: POWERAGENTS_DATA_ROOT, catalog: PluginCatalog, projects: ProjectService },
    setup({ logger, dataRoot, catalog, projects }): PluginServiceShape {
        const daemonDir = path.resolve(dataRoot, DAEMON_FOLDER);
        const manifestFile = path.join(daemonDir, MANIFEST_FILE);
        const copiesDir = path.join(daemonDir, COPIES_FOLDER);
        const skillsDir = path.join(daemonDir, SKILLS_FOLDER);
        const emitter = createEventEmitter<[event: PluginsChangedEvent]>();
        /** Changes run one at a time: two installations cannot each write the manifest without the other's entry. */
        let queue: Promise<unknown> = Promise.resolve();

        return { list, install, remove, sync, listen };

        async function list() {
            const [plugins, installed] = await Promise.all([catalog.list(), readInstalled()]);
            return plugins.map((plugin): PluginInfo => ({
                name: plugin.name,
                source: plugin.source,
                details: plugin.details,
                installs: installsOf(plugin, installed),
                errors: plugin.errors,
            }));
        }

        function install(params: PluginInstallParams) {
            return exclusive(() => installPlugin(params));
        }

        function remove(params: PluginInstallParams) {
            return exclusive(() => removePlugin(params));
        }

        function sync() {
            return exclusive(syncFolder);
        }

        function listen(listener: (event: PluginsChangedEvent) => void) {
            emitter.event.on(listener);
            return () => emitter.event.off(listener);
        }

        /** Runs `task` after every task queued before it. */
        function exclusive<T>(task: () => Promise<T>) {
            const result = queue.then(task);
            queue = result.catch(() => undefined);
            return result;
        }

        async function installPlugin({ name, projectId }: PluginInstallParams): Promise<PluginInstallResult> {
            const plugin = await catalog.get(name);
            if (!plugin) {
                throw new HttpError(404, { error: 'PluginNotFound', message: 'No plugin with this name' });
            }
            if (!plugin.details || plugin.errors.length > 0) {
                throw new HttpError(409, { error: 'PluginInvalid', message: 'The plugin has errors' });
            }
            if ((plugin.details.level === 'project') !== (projectId != null)) {
                throw new HttpError(400, {
                    error: 'PluginLevelMismatch',
                    message:
                        plugin.details.level === 'project'
                            ? 'A project plugin is installed in a project'
                            : 'A profile plugin is installed in the profile, not in a project',
                });
            }
            if (projectId != null && !(await projects.get(projectId))) {
                throw new HttpError(404, { error: 'ProjectNotFound', message: 'No project with this id' });
            }

            if (plugin.source === 'own') {
                // Installed by its folder being there: only its skills may need copying.
                await syncFolder();
                return { plugin, added: false };
            }

            // The daemon's folders are checked before the manifest changes: a refusal leaves it as it was.
            await ensureFolders();
            const installed = await readInstalled();
            if (installed.some(entry => isEntry(entry, name, projectId))) {
                return { plugin, added: false };
            }

            await changeInstalled([...installed, { name, ...(projectId != null && { projectId }) }]);
            logger.info('Plugin installed', { plugin: name, projectId });
            return { plugin, added: true };
        }

        async function removePlugin({ name, projectId }: PluginInstallParams) {
            const installed = await readInstalled();
            if (!installed.some(entry => isEntry(entry, name, projectId))) {
                throw new HttpError(404, { error: 'PluginNotInstalled', message: 'The plugin is not installed there' });
            }

            await ensureFolders();
            await changeInstalled(installed.filter(entry => !isEntry(entry, name, projectId)));
            logger.info('Plugin removed', { plugin: name, projectId });
        }

        /** Writes the manifest, then syncs the daemon's folder; the change is announced even when the sync fails. */
        async function changeInstalled(installed: InstalledPlugin[]) {
            await writeInstalled(installed);
            try {
                await syncFolder();
            } finally {
                emitter.emit({ type: 'pluginsChanged' });
            }
        }

        async function syncFolder() {
            await ensureFolders();
            const [installed, plugins] = await Promise.all([readInstalled(), catalog.list()]);
            const installedNames = new Set(installed.map(entry => entry.name));

            const copies = new Map<string, string>();
            const skills = new Map<string, string>();
            for (const plugin of plugins) {
                // An own plugin with errors (a conflicting one, say) is not loaded, nor is a broken bundled one.
                if (!plugin.details || plugin.errors.length > 0) {
                    continue;
                }
                if (plugin.source === 'bundled') {
                    if (!installedNames.delete(plugin.name)) {
                        continue;
                    }
                    copies.set(plugin.name, plugin.dir);
                }
                for (const skill of plugin.details.skills) {
                    // The skill's id, which the agent sees, is its folder's name.
                    skills.set(`${plugin.name}:${skill}`, path.join(plugin.dir, SKILLS_FOLDER, skill));
                }
            }
            for (const name of installedNames) {
                logger.warn('Installed plugin not loaded, not copied', { plugin: name });
            }

            const copiesChanged = await mirror(copiesDir, copies);
            const skillsChanged = await mirror(skillsDir, skills);
            const changed = copiesChanged || skillsChanged;
            logger.debug('Daemon folder synced', { changed, pluginCount: copies.size, skillCount: skills.size });
            return changed;
        }

        /**
         * Makes `parent` hold exactly a copy of each `desired` source folder under its name: anything else goes, and a
         * copy that differs from its source is replaced. A source that cannot be copied (too large, say) is left out.
         */
        async function mirror(parent: string, desired: Map<string, string>) {
            let changed = false;
            for (const name of await readdir(parent)) {
                if (!desired.has(name)) {
                    // Not recursive into a link: `rm` removes the link itself.
                    await rm(path.join(parent, name), { recursive: true, force: true });
                    changed = true;
                }
            }

            for (const [name, source] of desired) {
                const target = path.join(parent, name);
                // Names come from validated plugin and skill names; checked because a copy outside the daemon's folder
                // would write into the person's files.
                assert(path.dirname(target) === parent, "Plugin copy outside the daemon's folder");
                try {
                    const wanted = withoutOther(await readTree(source));
                    // A copy that cannot be read as one (a link in its place, say) is replaced like a stale one.
                    const current = await readTree(target).catch(() => null);
                    if (current && sameTree(wanted, current)) {
                        continue;
                    }
                    await writeCopy(parent, name, wanted);
                    changed = true;
                } catch (error) {
                    logger.warn('Plugin copy failed, left out', { copy: name, error });
                    changed = (await removeEntry(target)) || changed;
                }
            }
            return changed;
        }

        /**
         * Writes `tree` to a new hidden folder beside the copy and renames it over the copy's place, so the sandbox never
         * sees half a copy. Every folder is created anew and every file with `wx`, which fails on an entry already there,
         * a link included.
         */
        async function writeCopy(parent: string, name: string, tree: Tree) {
            const staging = path.join(parent, `.${name}.${randomUUID()}.tmp`);
            await mkdir(staging);
            try {
                for (const [relative, entry] of tree) {
                    const file = path.join(staging, relative);
                    if (entry === 'folder') {
                        await mkdir(file);
                    } else if (entry !== 'other') {
                        await writeFile(file, entry, { flag: 'wx' });
                    }
                }
                await removeEntry(path.join(parent, name));
                // Fails, rather than following it, on a link made in the copy's place since.
                await rename(staging, path.join(parent, name));
            } catch (error) {
                await rm(staging, { recursive: true, force: true });
                throw error;
            }
        }

        /**
         * Creates the daemon's folder and its `plugins/` and `skills/` when they are missing, never through a link; throws
         * when any of them is not a real folder (a link, a file), which is left as it is.
         */
        async function ensureFolders() {
            // The data root itself is the person's folder, mounted into the sandbox, not one the agent can replace.
            await mkdir(dataRoot, { recursive: true });
            for (const dir of [daemonDir, copiesDir, skillsDir]) {
                try {
                    // Not recursive: it fails on an existing entry instead of entering a link.
                    await mkdir(dir);
                } catch (error) {
                    if (!isErrorCode(error, 'EEXIST')) {
                        throw error;
                    }
                }
                if (!(await isRealFolder(dir))) {
                    logger.warn("Daemon's folder is not a folder, plugins not changed", {
                        folder: path.relative(dataRoot, dir),
                    });
                    throw new Error("Daemon's folder is not a folder");
                }
            }
        }

        /** The installations in the manifest; none when it is missing, and none, with a warning, when it is unreadable. */
        async function readInstalled() {
            let content: string;
            try {
                // A link (or anything but a file) is not followed.
                const stats = await lstat(manifestFile);
                if (!stats.isFile() || stats.size > MANIFEST_MAX_BYTES) {
                    logger.warn('Plugin manifest is not a file of its size, no plugins installed');
                    return [];
                }
                content = await readFile(manifestFile, 'utf8');
            } catch (error) {
                if (!isErrorCode(error, 'ENOENT')) {
                    logger.warn('Plugin manifest unreadable, no plugins installed', { error });
                }
                return [];
            }

            let value: unknown;
            try {
                value = JSON.parse(content);
            } catch (error) {
                logger.warn('Plugin manifest is not JSON, no plugins installed', { error });
                return [];
            }
            const installed = parseInstalled(value);
            if (!installed) {
                logger.warn('Plugin manifest malformed, no plugins installed');
                return [];
            }
            return installed;
        }

        /**
         * Replaces the manifest: written to a new file beside it and renamed over it, so a manifest swapped for a link is
         * replaced, not followed to the file it points at.
         */
        async function writeInstalled(installed: InstalledPlugin[]) {
            const temp = path.join(daemonDir, `${MANIFEST_FILE}.${randomUUID()}.tmp`);
            try {
                await writeFile(temp, `${JSON.stringify({ installed }, null, 4)}\n`, { flag: 'wx' });
                await rename(temp, manifestFile);
            } catch (error) {
                await rm(temp, { force: true });
                throw error;
            }
        }
    },
});

/** @__NO_SIDE_EFFECTS__ */
function installsOf(plugin: LocalPlugin, installed: InstalledPlugin[]): PluginInstall[] {
    if (plugin.source === 'own') {
        return plugin.errors.length === 0 ? [{ profile: true }] : [];
    }
    return installed
        .filter(entry => entry.name === plugin.name)
        .map((entry): PluginInstall => (entry.projectId != null ? { projectId: entry.projectId } : { profile: true }));
}

/** @__NO_SIDE_EFFECTS__ */
function isEntry(entry: InstalledPlugin, name: string, projectId: string | undefined) {
    return entry.name === name && entry.projectId === projectId;
}

/**
 * Reads every entry under a real folder, without following a link: a link inside is recorded as `other`, never read.
 * Throws when `dir` is not a real folder, or holds more than a copy may.
 */
async function readTree(dir: string) {
    if (!(await isRealFolder(dir))) {
        throw new Error('Not a folder');
    }
    const tree: Tree = new Map();
    let bytes = 0;
    await readFolder('');
    return tree;

    async function readFolder(relative: string) {
        const entries = (await readdir(path.join(dir, relative), { withFileTypes: true })).toSorted((a, b) =>
            a.name.localeCompare(b.name),
        );
        for (const entry of entries) {
            const child = path.join(relative, entry.name);
            if (tree.size >= COPY_MAX_ENTRIES) {
                throw new Error('Too many files to copy');
            }
            if (entry.isDirectory()) {
                tree.set(child, 'folder');
                await readFolder(child);
            } else if (entry.isFile()) {
                const content = await readFileNoFollow(path.join(dir, child));
                bytes += content?.length ?? 0;
                if (bytes > COPY_MAX_BYTES) {
                    throw new Error('Too large to copy');
                }
                tree.set(child, content ?? 'other');
            } else {
                tree.set(child, 'other');
            }
        }
    }
}

/** A file's content; `null` when it was swapped for a link or anything but a file since it was listed. */
async function readFileNoFollow(file: string) {
    let handle;
    try {
        // `O_NOFOLLOW` refuses a link where the system has it (not on Windows); the `isFile()` check below covers the rest.
        handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
        if (isErrorCode(error, 'ELOOP')) {
            return null;
        }
        throw error;
    }
    try {
        const stats = await handle.stat();
        if (!stats.isFile()) {
            return null;
        }
        if (stats.size > COPY_MAX_BYTES) {
            throw new Error('Too large to copy');
        }
        return await handle.readFile();
    } finally {
        await handle.close();
    }
}

/** @__NO_SIDE_EFFECTS__ */
function withoutOther(tree: Tree): Tree {
    return new Map([...tree].filter(([, entry]) => entry !== 'other'));
}

/** @__NO_SIDE_EFFECTS__ */
function sameTree(a: Tree, b: Tree) {
    if (a.size !== b.size) {
        return false;
    }
    for (const [relative, entry] of a) {
        const other = b.get(relative);
        if (other === undefined) {
            return false;
        }
        if (typeof entry === 'string' || typeof other === 'string' ? entry !== other : !entry.equals(other)) {
            return false;
        }
    }
    return true;
}

/** Removes a file, folder or link (never what a link points at); whether there was one. */
async function removeEntry(target: string) {
    try {
        await lstat(target);
    } catch (error) {
        if (isErrorCode(error, 'ENOENT')) {
            return false;
        }
        throw error;
    }
    await rm(target, { recursive: true, force: true });
    return true;
}

/**
 * The installations in a manifest read back; `null` when it is not one. A name that is not a plugin's is not one
 * either: names become paths.
 * @__NO_SIDE_EFFECTS__
 */
function parseInstalled(value: unknown): InstalledPlugin[] | null {
    if (typeof value !== 'object' || value === null || !('installed' in value) || !Array.isArray(value.installed)) {
        return null;
    }
    const entries: unknown[] = value.installed;
    const installed: InstalledPlugin[] = [];
    for (const entry of entries) {
        if (
            typeof entry !== 'object' ||
            entry === null ||
            !('name' in entry) ||
            typeof entry.name !== 'string' ||
            !PLUGIN_NAME_PATTERN.test(entry.name)
        ) {
            return null;
        }
        if (!('projectId' in entry)) {
            installed.push({ name: entry.name });
        } else if (typeof entry.projectId === 'string') {
            installed.push({ name: entry.name, projectId: entry.projectId });
        } else {
            return null;
        }
    }
    return installed;
}
