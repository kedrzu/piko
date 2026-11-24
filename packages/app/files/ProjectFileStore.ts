import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { assert } from '@nzyme/utils/assert.js';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { computed, reactive, ref } from 'vue';

import type { DaemonEvent } from '@piko/common/api/DaemonEventTypes.js';
import { ProjectFileListEndpoint } from '@piko/common/api/ProjectFileListEndpoint.js';
import type { ProjectFileEntry } from '@piko/common/api/ProjectFileTypes.js';

import { DaemonClient } from '@/daemon/DaemonClient.js';
import { DaemonEventStream } from '@/daemon/DaemonEventStream.js';

/** The project's folder itself, as a key of the loaded folders. */
const ROOT = '';

/** A line of the open project's file tree as the sidebar shows it: an entry under its expanded folders. */
export interface ProjectFileRow {
    entry: ProjectFileEntry;
    /** How many folders it sits in: 0 in the project's folder. */
    depth: number;
    /** A folder whose entries show under it. */
    expanded: boolean;
}

/**
 * The open project's files as the sidebar's tree shows them, a folder at a time: the project's folder loads when the
 * project opens, a folder when it is expanded. A change in the project's files (or a reconnect) lists the project's
 * folder and every expanded one again, and forgets an expanded folder that is gone. Only one project's files are held;
 * opening another replaces them, while each project's expanded folders are kept for as long as the app runs.
 */
export const ProjectFileStore = defineService({
    name: 'ProjectFileStore',
    deps: { daemon: DaemonClient, events: DaemonEventStream, logger: Logger },
    setup({ daemon, events, logger }) {
        const projectId = ref<string | null>(null);
        /** The open project's folders loaded, by path; a folder is missing until its first load. */
        const folders = ref(new Map<string, readonly ProjectFileEntry[]>());
        /** The folders expanded, by project id, then by path. */
        const expandedByProject = ref(new Map<string, Set<string>>());
        /** Counts loads by folder, so an older answer never replaces a newer one. */
        const loadSeq = new Map<string, number>();

        const expanded = computed(() =>
            projectId.value === null ? undefined : expandedByProject.value.get(projectId.value),
        );

        const state = reactive({
            /** The project whose files these are. */
            projectId: computed(() => projectId.value),
            /**
             * The tree's lines, folders first in each folder, each expanded folder followed by its entries; `null` until
             * the project's folder is loaded.
             */
            rows: computed(() => (folders.value.has(ROOT) ? rowsOf(ROOT, 0) : null)),
        });

        events.event.on(onEvent);

        return { state, open, toggle };

        /** Loads a project's files, unless they are the ones held already. */
        function open(id: string) {
            if (projectId.value === id) {
                return;
            }
            projectId.value = id;
            folders.value = new Map();
            loadSeq.clear();
            void refresh();
        }

        /** Expands a folder of the open project, loading its entries, or collapses it. */
        function toggle(path: string) {
            const id = projectId.value;
            if (id === null) {
                return;
            }
            if (!expandedByProject.value.has(id)) {
                expandedByProject.value.set(id, new Set());
            }
            // Read back through the reactive map, so the change below is tracked.
            const set = expandedByProject.value.get(id);
            assert(set);
            if (set.delete(path)) {
                return;
            }
            set.add(path);
            void load(path);
        }

        /** Lists the project's folder and every expanded folder again. */
        async function refresh() {
            await Promise.all([load(ROOT), ...[...(expanded.value ?? [])].map(load)]);
        }

        async function load(path: string) {
            const id = projectId.value;
            if (id === null) {
                return;
            }
            const seq = (loadSeq.get(path) ?? 0) + 1;
            loadSeq.set(path, seq);
            try {
                const result = await daemon(
                    ProjectFileListEndpoint,
                    path === ROOT ? { projectId: id } : { projectId: id, path },
                );
                if (projectId.value !== id || loadSeq.get(path) !== seq) {
                    return;
                }
                if ('entries' in result) {
                    folders.value.set(path, result.entries);
                } else if (path === ROOT) {
                    // The project is gone: the projects' list drops it soon.
                    folders.value.set(path, []);
                } else {
                    folders.value.delete(path);
                    expandedByProject.value.get(id)?.delete(path);
                }
            } catch (error) {
                // The tree keeps what it shows; the next change or reconnect tries again.
                logger.warn('Project files could not be listed', { projectId: id, path, error });
            }
        }

        function rowsOf(path: string, depth: number): ProjectFileRow[] {
            const rows: ProjectFileRow[] = [];
            for (const entry of folders.value.get(path) ?? []) {
                const isOpen = entry.kind === 'folder' && (expanded.value?.has(entry.path) ?? false);
                rows.push({ entry, depth, expanded: isOpen });
                if (isOpen) {
                    rows.push(...rowsOf(entry.path, depth + 1));
                }
            }
            return rows;
        }

        function onEvent(event: DaemonEvent) {
            switch (event.type) {
                case 'projectFilesChanged':
                    if (event.projectId === projectId.value) {
                        void refresh();
                    }
                    break;
                case 'streamRestored':
                    void refresh();
                    break;
                case 'projectsChanged':
                case 'memoryChanged':
                case 'schedulesChanged':
                case 'pluginsChanged':
                case 'pluginInstalled':
                case 'fileAgentChanged':
                case 'conversationCreated':
                case 'conversationRenamed':
                case 'runningChanged':
                case 'textDelta':
                case 'stepStarted':
                case 'stepFinished':
                case 'stepFailed':
                case 'runFinished':
                    // Not about the open project's files.
                    break;
                default:
                    assertNever(event);
            }
        }
    },
});
