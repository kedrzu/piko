import { mkdirSync, watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import path from 'node:path';

import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';

import type { DataRootEvent } from '@piko/common/api/DaemonEventTypes.js';

import { MEMORY_FOLDER, PIKO_DATA_ROOT, PROJECTS_FOLDER, SCHEDULES_FOLDER } from '../env.js';
import { ProjectService } from '../projects/ProjectService.js';

/**
 * Changes in the profile's data root, for the daemon's event stream: one watcher on the whole data root, started by the
 * first listener and closed when the last one leaves. A watcher that fails is closed and started again after
 * `RESTART_DELAY_MS`, while anyone listens. Changes are gathered for `DEBOUNCE_MS` from the first one, then each kind is
 * sent once (files and schedules inside a project once per project), so an agent writing many files sends a few events, not one per
 * file.
 */
export interface DataRootWatchServiceShape {
    /** Calls `listener` with every change from now on, until the returned function is called. */
    listen(listener: (event: DataRootEvent) => void): () => void;
}

/** How long changes are gathered before they are sent. */
const DEBOUNCE_MS = 300;
/** How long after a failure the watcher is started again. */
const RESTART_DELAY_MS = 1000;
const PROJECT_MARKER = '.project.json';

/** What one change in the data root means, before it is sent. */
type DataRootChange =
    | { type: 'projectsChanged' | 'memoryChanged' }
    /**
     * A file inside the project kept in `folder` (a folder name directly in the projects' folder): one in the project's
     * schedules folder is `schedulesChanged`, any other `projectFilesChanged`.
     */
    | { type: 'projectFilesChanged' | 'schedulesChanged'; folder: string };

/** Params of the watcher's flush of the changes inside projects. */
interface ProjectChangesFlushParams {
    /** Folders of projects with changed files. */
    folders: string[];
    /** Folders of projects with changed schedules. */
    scheduleFolders: string[];
    /** Every project may have changed. */
    all: boolean;
}

/** The profile's data root, watched. */
export const DataRootWatchService = defineService({
    name: 'DataRootWatchService',
    deps: { logger: Logger, dataRoot: PIKO_DATA_ROOT, projects: ProjectService },
    setup({ logger, dataRoot, projects }): DataRootWatchServiceShape {
        const root = path.resolve(dataRoot);
        const emitter = createEventEmitter<[event: DataRootEvent]>();
        const pending = new Set<'projectsChanged' | 'memoryChanged'>();
        /** The folders of projects whose files changed; mapped to the projects' ids when sent. */
        const pendingFolders = new Set<string>();
        /** The folders of projects whose schedules changed; mapped to the projects' ids when sent. */
        const pendingScheduleFolders = new Set<string>();
        /** Whether any project's files may have changed: a change without a file name. */
        let pendingAllProjects = false;
        let listenerCount = 0;
        let watcher: FSWatcher | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let restartTimer: ReturnType<typeof setTimeout> | undefined;
        /** Whether the last start failed: only the first failure in a row is a warning. */
        let failing = false;

        return { listen };

        function listen(listener: (event: DataRootEvent) => void) {
            emitter.event.on(listener);
            listenerCount++;
            startWatching();
            let listening = true;
            return () => {
                if (!listening) {
                    return;
                }
                listening = false;
                emitter.event.off(listener);
                listenerCount--;
                if (listenerCount === 0) {
                    stopWatching();
                }
            };
        }

        function startWatching() {
            if (watcher || listenerCount === 0) {
                return;
            }
            clearTimeout(restartTimer);
            restartTimer = undefined;
            try {
                // A missing data root cannot be watched; the daemon creates it with the Memory folder anyway.
                mkdirSync(root, { recursive: true });
                const started = watch(root, { recursive: true }, (_type, file) => onChange(file));
                started.on('error', error => {
                    if (watcher === started) {
                        onFailure(error);
                    }
                });
                watcher = started;
            } catch (error) {
                onFailure(error);
                return;
            }
            if (failing) {
                // Whatever changed during the outage went unseen: tell the listeners to look again.
                failing = false;
                onChange(null);
            }
            logger.debug('Data root watched');
        }

        function onFailure(error: unknown) {
            if (failing) {
                logger.debug('Data root watcher failed again', { error });
            } else {
                logger.warn('Data root watcher failed, restarting', { error });
            }
            failing = true;
            watcher?.close();
            watcher = undefined;
            restartTimer ??= setTimeout(startWatching, RESTART_DELAY_MS);
        }

        function stopWatching() {
            watcher?.close();
            watcher = undefined;
            clearTimeout(restartTimer);
            restartTimer = undefined;
            clearTimeout(timer);
            timer = undefined;
            pending.clear();
            pendingFolders.clear();
            pendingScheduleFolders.clear();
            pendingAllProjects = false;
            failing = false;
            logger.debug('Data root no longer watched');
        }

        function onChange(file: string | null) {
            if (file === null) {
                // Without a file name the change could be anywhere: in the list, the Memory, any project's files.
                pending.add('projectsChanged');
                pending.add('memoryChanged');
                pendingAllProjects = true;
            } else {
                const change = classify(file);
                if (change === null) {
                    return;
                }
                if (change.type === 'projectFilesChanged') {
                    pendingFolders.add(change.folder);
                } else if (change.type === 'schedulesChanged') {
                    pendingScheduleFolders.add(change.folder);
                } else {
                    pending.add(change.type);
                }
            }
            timer ??= setTimeout(flush, DEBOUNCE_MS);
        }

        function flush() {
            timer = undefined;
            const types = [...pending];
            pending.clear();
            for (const type of types) {
                emitter.emit({ type });
            }
            const folders = [...pendingFolders];
            const scheduleFolders = [...pendingScheduleFolders];
            const allProjects = pendingAllProjects;
            pendingFolders.clear();
            pendingScheduleFolders.clear();
            pendingAllProjects = false;
            if (allProjects || folders.length > 0 || scheduleFolders.length > 0) {
                void flushProjectChanges({ folders, scheduleFolders, all: allProjects });
            }
        }

        /**
         * Sends `projectFilesChanged` for each project kept in one of `folders` and `schedulesChanged` for each kept in
         * one of `scheduleFolders`, or both for every project when `all`. A folder is mapped to the project now, not when
         * the change came: a folder without a marker is no project.
         */
        async function flushProjectChanges({ folders, scheduleFolders, all }: ProjectChangesFlushParams) {
            const list = await projects.list().catch((error: unknown) => {
                logger.warn('Projects could not be listed, project changes not sent', { error });
                return [];
            });
            for (const project of list) {
                const folder = path.basename(project.dir);
                if (all || folders.includes(folder)) {
                    emitter.emit({ type: 'projectFilesChanged', projectId: project.id });
                }
                if (all || scheduleFolders.includes(folder)) {
                    emitter.emit({ type: 'schedulesChanged', projectId: project.id });
                }
            }
        }
    },
});

/**
 * What a change at `file` (relative to the data root) means to the app, or `null` when nothing: a project folder itself
 * or its marker changes the project list, a file inside a project's schedules folder that project's schedules, any other file inside a project folder that project's files, anything in the
 * Memory folder the Memory.
 * @__NO_SIDE_EFFECTS__
 */
function classify(file: string): DataRootChange | null {
    const [top, folder, name, ...rest] = file.split(/[\\/]/);
    switch (top) {
        case PROJECTS_FOLDER:
            if (folder === undefined || name === undefined || (name === PROJECT_MARKER && rest.length === 0)) {
                return { type: 'projectsChanged' };
            }
            return { type: name === SCHEDULES_FOLDER ? 'schedulesChanged' : 'projectFilesChanged', folder };
        case MEMORY_FOLDER:
            return { type: 'memoryChanged' };
        default:
            return null;
    }
}
