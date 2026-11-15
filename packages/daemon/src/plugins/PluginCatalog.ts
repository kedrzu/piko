import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';

import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';

import type { PluginError, PluginInfo, PluginSource } from '@poweragents/common/api/PluginTypes.js';

import { PLUGINS_FOLDER, POWERAGENTS_DATA_ROOT, POWERAGENTS_PLUGINS_DIR } from '../env.js';
import { isErrorCode } from '../utils/isErrorCode.js';
import { isRealFolder } from '../utils/isRealFolder.js';
import { parsePluginManifest, PLUGIN_NAME_PATTERN } from './parsePluginManifest.js';
import type { PluginManifest } from './parsePluginManifest.js';

/** A plugin with the folder that holds it. */
export interface LocalPlugin extends PluginInfo {
    /** The plugin's folder: an absolute path directly inside its source's folder. */
    dir: string;
    /** Its `plugin.json`, when it is valid; also for a plugin with other errors (a conflict, say). */
    manifest: PluginManifest | null;
}

/**
 * The plugins of both sources: bundled ones in `POWERAGENTS_PLUGINS_DIR`, own ones in the data root's `PLUGINS_FOLDER`,
 * one folder each. Both are read on every call: a few small files, and an own plugin changes whenever the person or the
 * agent edits it. Anything under the data root may be the agent's, so an own plugin is untrusted input: whatever is wrong
 * with it is reported in its `errors`, never thrown, and no folder or file is read through a link.
 */
export interface PluginCatalogShape {
    /**
     * Every plugin, sorted by name, a bundled one before an own one of the same name, which is a conflict: the own one
     * gets the `conflict` error and is not loaded. Files and hidden entries in a source's folder are not plugins.
     */
    list(): Promise<LocalPlugin[]>;
    /** The plugin with this name, the bundled one when an own one conflicts with it; `null` when there is none. */
    get(name: string): Promise<LocalPlugin | null>;
}

const MANIFEST_FILE = 'plugin.json';
const SKILLS_FOLDER = 'skills';
const SKILL_FILE = 'SKILL.md';
/** A `plugin.json` holds a few names and texts; anything larger is not one, and is not read into memory. */
const MANIFEST_MAX_BYTES = 64 * 1024;

/** The plugins the agent can install or has, from the app and from the person's data root. */
export const PluginCatalog = defineService({
    name: 'PluginCatalog',
    deps: { logger: Logger, bundledDir: POWERAGENTS_PLUGINS_DIR, dataRoot: POWERAGENTS_DATA_ROOT },
    setup({ logger, bundledDir, dataRoot }): PluginCatalogShape {
        const ownDir = path.resolve(dataRoot, PLUGINS_FOLDER);

        return { list, get };

        async function list() {
            const bundled = await readSource(path.resolve(bundledDir), 'bundled');
            const bundledNames = new Set(bundled.map(plugin => plugin.name));
            // A link in place of the own plugins' folder could point anywhere on this computer: no own plugins then.
            const own = (await isRealFolder(ownDir)) ? await readOwn() : [];
            const checkedOwn = own.map((plugin): LocalPlugin =>
                bundledNames.has(plugin.name)
                    ? { ...plugin, errors: [...plugin.errors, { code: 'conflict' }] }
                    : plugin,
            );

            // A stable sort: a bundled plugin stays before an own one of the same name.
            return [...bundled, ...checkedOwn].toSorted((a, b) => a.name.localeCompare(b.name));
        }

        async function get(name: string) {
            const plugins = await list();
            return plugins.find(plugin => plugin.name === name) ?? null;
        }

        /**
         * The own plugins; none, with a warning, when their folder cannot be read (no permission, say): the bundled
         * plugins still list.
         */
        async function readOwn() {
            try {
                return await readSource(ownDir, 'own');
            } catch (error) {
                logger.warn('Own plugins folder unreadable, no own plugins listed', { error });
                return [];
            }
        }

        /** Reads every plugin folder in a source's folder; none when the folder does not exist. */
        async function readSource(root: string, source: PluginSource) {
            const entries = await readdir(root, { withFileTypes: true }).catch((error: unknown) => {
                if (isErrorCode(error, 'ENOENT')) {
                    return [];
                }
                throw error;
            });

            const plugins: LocalPlugin[] = [];
            for (const entry of entries) {
                // A link is listed, so a plugin linked in from elsewhere shows why it is not loaded instead of vanishing.
                if (!entry.name.startsWith('.') && (entry.isDirectory() || entry.isSymbolicLink())) {
                    plugins.push(await readPlugin(path.join(root, entry.name), source));
                }
            }
            return plugins;
        }

        async function readPlugin(dir: string, source: PluginSource): Promise<LocalPlugin> {
            const plugin: LocalPlugin = {
                name: path.basename(dir),
                source,
                details: null,
                installs: [],
                errors: [],
                environmentError: null,
                dir,
                manifest: null,
            };

            try {
                // `readdir()` reports links already; checked again, as the agent can swap a folder for one since.
                if (!(await isRealFolder(dir))) {
                    return { ...plugin, errors: [{ code: 'notFolder' }] };
                }

                const read = await readManifest(dir);
                const skills = await readSkills(dir);
                const parsed = 'error' in read ? { errors: [read.error] } : parsePluginManifest(read.value);
                if ('errors' in parsed) {
                    return { ...plugin, errors: [...parsed.errors, ...skills.errors] };
                }

                const manifest = parsed.manifest;
                const errors = [...skills.errors];
                if (manifest.name !== plugin.name) {
                    errors.push({ code: 'nameMismatch' });
                }
                if (source === 'own' && manifest.level === 'project') {
                    errors.push({ code: 'projectLevel' });
                }
                if (manifest.onboarding != null && !skills.names.includes(manifest.onboarding)) {
                    errors.push({ code: 'onboardingMissing', skill: manifest.onboarding });
                }

                return {
                    ...plugin,
                    manifest,
                    details: {
                        level: manifest.level,
                        tags: manifest.tags,
                        marketplace: manifest.marketplace,
                        ...(manifest.onboarding != null && { onboarding: manifest.onboarding }),
                        skills: skills.names,
                    },
                    errors,
                };
            } catch (error) {
                // Whatever else fails (no permission, say) is the plugin's error: the other plugins still list.
                logger.warn('Plugin unreadable', { folder: plugin.name, source, error });
                return { ...plugin, errors: [{ code: 'unreadable' }] };
            }
        }
    },
});

type ManifestReadResult = { value: unknown } | { error: PluginError };

async function readManifest(dir: string): Promise<ManifestReadResult> {
    const file = path.join(dir, MANIFEST_FILE);
    let stats;
    try {
        stats = await lstat(file);
    } catch (error) {
        if (isErrorCode(error, 'ENOENT')) {
            return { error: { code: 'manifestMissing' } };
        }
        throw error;
    }
    // A link (or anything but a file, a pipe that would block the read) is not opened.
    if (!stats.isFile()) {
        return { error: { code: 'manifestNotFile' } };
    }

    let content: string;
    try {
        // `O_NOFOLLOW` also refuses a link swapped in since the check above, where the system has it (not on Windows).
        const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            const opened = await handle.stat();
            if (!opened.isFile()) {
                return { error: { code: 'manifestNotFile' } };
            }
            if (opened.size > MANIFEST_MAX_BYTES) {
                return { error: { code: 'manifestTooLarge' } };
            }
            content = await handle.readFile('utf8');
        } finally {
            await handle.close();
        }
    } catch (error) {
        if (isErrorCode(error, 'ELOOP')) {
            return { error: { code: 'manifestNotFile' } };
        }
        throw error;
    }

    try {
        return { value: JSON.parse(content) };
    } catch {
        return { error: { code: 'manifestNotJson' } };
    }
}

interface SkillsReadResult {
    /** The valid skills' names, sorted. */
    names: string[];
    errors: PluginError[];
}

/**
 * The plugin's skills: each a folder in `skills/` holding a `SKILL.md` file. Files beside them are skipped; a plugin
 * without `skills/` has none.
 */
async function readSkills(dir: string): Promise<SkillsReadResult> {
    const skillsDir = path.join(dir, SKILLS_FOLDER);
    let stats;
    try {
        stats = await lstat(skillsDir);
    } catch (error) {
        if (isErrorCode(error, 'ENOENT')) {
            return { names: [], errors: [] };
        }
        throw error;
    }
    if (!stats.isDirectory()) {
        return { names: [], errors: [{ code: 'skillsNotFolder' }] };
    }

    const names: string[] = [];
    const errors: PluginError[] = [];
    // Sorted, so the names and the errors come in the same order on every listing.
    const entries = (await readdir(skillsDir, { withFileTypes: true })).toSorted((a, b) =>
        a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.isFile()) {
            continue;
        }
        if (await isSkill(path.join(skillsDir, entry.name))) {
            names.push(entry.name);
        } else {
            errors.push({ code: 'invalidSkill', skill: entry.name });
        }
    }
    return { names, errors };
}

/** Whether `dir` is a skill's real folder with a valid name and a `SKILL.md` file, neither of them a link. */
async function isSkill(dir: string) {
    if (!PLUGIN_NAME_PATTERN.test(path.basename(dir)) || !(await isRealFolder(dir))) {
        return false;
    }
    try {
        return (await lstat(path.join(dir, SKILL_FILE))).isFile();
    } catch (error) {
        if (isErrorCode(error, 'ENOENT')) {
            return false;
        }
        throw error;
    }
}
