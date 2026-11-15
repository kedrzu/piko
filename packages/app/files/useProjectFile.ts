import type { Logger } from '@nzyme/logging/Logger.js';
import { assert } from '@nzyme/utils/assert.js';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { useLogger } from '@nzyme/vue-ioc/useLogger.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { onEventEmitter } from '@nzyme/vue-utils/onEventEmitter.js';
import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import { reactive } from '@nzyme/vue-utils/reactivity/reactive.js';
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import type { DaemonEvent } from '@poweragents/common/api/DaemonEventTypes.js';
import { ProjectFileReadEndpoint } from '@poweragents/common/api/ProjectFileReadEndpoint.js';
import type {
    ProjectFileReadResult,
    ProjectFileWriteResult,
    ProjectTextFile,
} from '@poweragents/common/api/ProjectFileTypes.js';
import { ProjectFileWriteEndpoint } from '@poweragents/common/api/ProjectFileWriteEndpoint.js';
import { fileExtension } from '@poweragents/common/utils/fileExtension.js';
import { mergeMarkdown } from '@poweragents/ui/utils/mergeMarkdown.js';
import { mergeText } from '@poweragents/ui/utils/mergeText.js';

import { DaemonClient } from '@/daemon/DaemonClient.js';
import type { DaemonClientShape } from '@/daemon/DaemonClient.js';
import { DaemonEventStream } from '@/daemon/DaemonEventStream.js';

import { FileAgentStore } from './FileAgentStore.js';
import type { FileAgent } from './FileAgentStore.js';

export interface UseProjectFileOptions {
    projectId: MaybeRefOrGetter<string>;
    /** Relative to the project's folder. */
    path: MaybeRefOrGetter<string>;
}

/**
 * How the file shows: a Markdown file in the editor, a plain text or CSV file read-only, an image or a PDF previewed,
 * anything else (and a file too large) only named, to open elsewhere.
 */
export type ProjectFileView = 'markdown' | 'text' | 'csv' | 'image' | 'pdf' | 'elsewhere';

/**
 * Why the person's text is not on disk: the save failed (tried again on the next edit or Try again), the text is over
 * what the app saves, or the file changed on disk under the person's unsaved changes and the two could not be merged
 * (nothing is saved until the person keeps theirs or takes the disk's).
 */
export type ProjectFileSaveProblem = 'failed' | 'tooLarge' | 'changedOnDisk';

export interface ProjectFileViewModel {
    /** The file has been read once. */
    readonly loaded: boolean;
    /** The file could not be read, and has never been. */
    readonly loadFailed: boolean;
    /** The file is no longer on disk (deleted or moved): it shows as last read, read-only, and is never written again. */
    readonly gone: boolean;
    /** How the file shows; `null` until it has been read. */
    readonly view: ProjectFileView | null;
    /** For the `elsewhere` view: the file is over what the app reads. */
    readonly tooLarge: boolean;
    /** The text shown: for a text file, what the person sees in it, their unsaved changes included. */
    readonly content: string;
    /** Epoch ms of the file's last change on disk as last seen; also what a preview reloads on. */
    readonly updatedAt: number | null;
    /** The person changed the text since it was last read or saved. */
    readonly dirty: boolean;
    readonly saveProblem: ProjectFileSaveProblem | null;
    /**
     * The file's text on disk when it changed under the person's unsaved changes and could not be merged with them:
     * what Take the agent's puts in the editor. `null` when the file is no longer text.
     */
    readonly disk: ProjectTextFile | null;
    /** What the agent is doing to the file; while it writes, the person does not edit it. */
    readonly agent: FileAgent | null;
    /** The person's edit of a Markdown file: saved a moment after they stop typing, and every few seconds while they type. */
    edit(content: string): void;
    /** Saves the person's changes now, without waiting for the pause, and resolves once nothing is being saved. */
    flush(): Promise<void>;
    /** Tries again what failed: the save, or the first read. */
    retry(): Promise<void>;
    /** Settles a conflict with the disk by saving the person's text over the disk's, and resolves once it is saved. */
    keepMine(): Promise<void>;
    /** Settles a conflict with the disk by dropping the person's changes for the disk's text; nothing is saved. */
    takeDisk(): void;
}

/** A save waits this long after the last change: one save for a burst of typing. */
const SAVE_IDLE_MS = 1_000;
/**
 * Unsaved changes wait at most this long, so continuous typing still saves every few seconds: a save is the signal that
 * the person is typing.
 */
const SAVE_MAX_WAIT_MS = 3_000;

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

/**
 * A project file open for the person: read from the daemon, read again when the project's files change, and for a
 * Markdown file their edits saved as they type, each save carrying the version it was made from. A change on disk is
 * taken one way, from wherever it is learned: with no unsaved changes the file is read again; with unsaved changes it
 * is merged with the person's text and the result saved, and when the two touch the same lines nothing is saved until
 * the person chooses one. A file gone from disk is never recreated. When the agent starts writing the file, what the
 * person typed is saved at once; when it stops, the file is read again the same one way. Not tied to a
 * route: the project and the path are inputs, and a change of either closes the file (saving what is unsaved) and
 * opens the other.
 */
export function useProjectFile(options: UseProjectFileOptions): ProjectFileViewModel {
    const daemon = useService(DaemonClient);
    const events = useService(DaemonEventStream);
    const fileAgents = useService(FileAgentStore);
    const logger = useLogger();

    const projectId = makeRef(options.projectId);
    const path = makeRef(options.path);
    const file = shallowRef(openFile());
    const agent = computed(() => fileAgents.get(projectId.value, path.value));
    const agentWriting = computed(() => agent.value?.state === 'writing');

    watch([projectId, path], () => {
        file.value.close();
        file.value = openFile();
    });
    // Synchronous, so the save starts before editing turns off: nothing typed is left waiting for the pause.
    watch(
        agentWriting,
        (writing, wasWriting) => {
            if (writing) {
                void file.value.flush();
            } else if (wasWriting) {
                file.value.onDiskChanged();
            }
        },
        { flush: 'sync' },
    );
    onScopeDispose(() => file.value.close());
    onEventEmitter(events.event, onEvent);

    return reactive<ProjectFileViewModel>({
        loaded: computed(() => file.value.loaded),
        loadFailed: computed(() => file.value.loadFailed),
        gone: computed(() => file.value.gone),
        view: computed(() => file.value.view),
        tooLarge: computed(() => file.value.tooLarge),
        content: computed(() => file.value.content),
        updatedAt: computed(() => file.value.updatedAt),
        dirty: computed(() => file.value.dirty),
        saveProblem: computed(() => file.value.saveProblem),
        disk: computed(() => file.value.disk),
        agent,
        edit,
        flush,
        retry,
        keepMine,
        takeDisk,
    });

    function edit(content: string) {
        file.value.edit(content);
    }

    function flush() {
        return file.value.flush();
    }

    function retry() {
        return file.value.retry();
    }

    function keepMine() {
        return file.value.keepMine();
    }

    function takeDisk() {
        file.value.takeDisk();
    }

    function openFile() {
        return openProjectFile({ daemon, logger, projectId: projectId.value, path: path.value });
    }

    function onEvent(event: DaemonEvent) {
        switch (event.type) {
            case 'projectFilesChanged':
                if (event.projectId === projectId.value) {
                    file.value.onDiskChanged();
                }
                break;
            case 'streamRestored':
                // Changes during the gap were not streamed.
                file.value.onDiskChanged();
                break;
            case 'projectsChanged':
            case 'memoryChanged':
            case 'fileAgentChanged':
            case 'conversationCreated':
            case 'conversationRenamed':
            case 'runningChanged':
            case 'textDelta':
            case 'stepStarted':
            case 'stepFinished':
            case 'stepFailed':
            case 'runFinished':
                // Not about the project's files.
                break;
            default:
                assertNever(event);
        }
    }
}

/** What one open file needs. */
interface OpenProjectFileParams {
    daemon: DaemonClientShape;
    logger: Logger;
    projectId: string;
    path: string;
}

/** One file open, for as long as it stays the composable's file; what the agent does to it is the composable's. */
interface OpenProjectFile extends Omit<ProjectFileViewModel, 'agent'> {
    /** The project's files changed, or may have: reads the file again. */
    onDiskChanged(): void;
    /** The file is no longer shown: what is unsaved is saved, and nothing more is read. */
    close(): void;
}

/** Opens one file: reads it at once. */
function openProjectFile({ daemon, logger, projectId, path }: OpenProjectFileParams): OpenProjectFile {
    const fields = { projectId, path };
    const loaded = ref(false);
    const loadFailed = ref(false);
    const gone = ref(false);
    const view = ref<ProjectFileView | null>(null);
    const tooLarge = ref(false);
    const content = ref('');
    const updatedAt = ref<number | null>(null);
    /** The text on disk as last read or written: what a save's version and `dirty` are told against. */
    const base = ref<ProjectTextFile | null>(null);
    const saveProblem = ref<ProjectFileSaveProblem | null>(null);
    const disk = ref<ProjectTextFile | null>(null);
    const dirty = computed(() => base.value !== null && content.value !== base.value.content);

    let closed = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let maxWaitTimer: ReturnType<typeof setTimeout> | undefined;
    /** The save on its way, if any; saves never overlap, so each carries the version the previous one gave. */
    let saving: Promise<void> | null = null;
    /** Counts saves started, so a read made before one is not taken as the disk's newer text. */
    let saveCount = 0;
    /** Counts reads, so an older answer never replaces a newer one. */
    let readSeq = 0;
    /** A read was asked for while a save was on its way: it runs once the save is answered. */
    let readAfterSave = false;

    void read();

    return reactive<OpenProjectFile>({
        loaded,
        loadFailed,
        gone,
        view,
        tooLarge,
        content,
        updatedAt,
        dirty,
        saveProblem,
        disk,
        edit,
        flush,
        retry,
        keepMine,
        takeDisk,
        onDiskChanged,
        close,
    });

    function edit(value: string) {
        if (closed || gone.value || view.value !== 'markdown') {
            return;
        }
        content.value = value;
        if (saveProblem.value === 'changedOnDisk') {
            // Saving would overwrite the disk's text: the person's waits for their choice.
            return;
        }
        if (dirty.value) {
            scheduleSave();
        } else {
            clearTimers();
        }
    }

    async function flush() {
        clearTimers();
        // The save on its way is answered first: what was typed meanwhile goes right after it.
        await saving;
        await save();
    }

    async function retry() {
        if (!loaded.value) {
            await read();
            return;
        }
        await flush();
    }

    async function keepMine() {
        const theirs = disk.value;
        if (closed || saveProblem.value !== 'changedOnDisk' || !theirs) {
            return;
        }
        // Saved on the disk's version, so the save is not stale; a change on disk after it is merged as any other.
        base.value = theirs;
        disk.value = null;
        saveProblem.value = null;
        await flush();
    }

    function takeDisk() {
        const theirs = disk.value;
        if (closed || saveProblem.value !== 'changedOnDisk' || !theirs) {
            return;
        }
        base.value = theirs;
        content.value = theirs.content;
        disk.value = null;
        saveProblem.value = null;
        clearTimers();
    }

    function onDiskChanged() {
        if (!closed) {
            void read();
        }
    }

    function close() {
        closed = true;
        clearTimers();
        void save();
    }

    function scheduleSave() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => void save(), SAVE_IDLE_MS);
        maxWaitTimer ??= setTimeout(() => void save(), SAVE_MAX_WAIT_MS);
    }

    function clearTimers() {
        clearTimeout(idleTimer);
        clearTimeout(maxWaitTimer);
        idleTimer = undefined;
        maxWaitTimer = undefined;
    }

    /** Saves the unsaved changes, unless a save is on its way: the changes made meanwhile go once it is answered. */
    async function save() {
        clearTimers();
        const from = base.value;
        if (saving || !from || !dirty.value || gone.value || saveProblem.value === 'changedOnDisk') {
            return;
        }
        const sent = content.value;
        saveCount++;
        saving = write(sent, from.version);
        await saving;
        saving = null;

        if (readAfterSave && !closed) {
            readAfterSave = false;
            void read();
        }
        if (dirty.value && saveProblem.value === null) {
            // Typed while the save was on its way; once closed, nothing waits for the pause.
            if (closed) {
                void save();
            } else {
                scheduleSave();
            }
        }
    }

    async function write(sent: string, version: string) {
        let result: ProjectFileWriteResult;
        try {
            result = await daemon(ProjectFileWriteEndpoint, { projectId, path, content: sent, version });
        } catch (error) {
            logger.warn('Project file could not be saved', { ...fields, error });
            saveProblem.value = 'failed';
            return;
        }
        if ('written' in result) {
            base.value = { content: sent, ...result.written };
            updatedAt.value = result.written.updatedAt;
            saveProblem.value = null;
        } else if ('stale' in result) {
            takeDiskText(result.stale);
        } else if ('tooLarge' in result) {
            logger.warn('Project file too large, not saved', fields);
            saveProblem.value = 'tooLarge';
        } else {
            logger.info('Project file gone, not saved', fields);
            gone.value = true;
        }
    }

    async function read() {
        if (saving) {
            // The answer could be the file before the save or after it; read once the save is answered.
            readAfterSave = true;
            return;
        }
        const seq = ++readSeq;
        const savesBefore = saveCount;
        let result: ProjectFileReadResult;
        try {
            result = await daemon(ProjectFileReadEndpoint, { projectId, path });
        } catch (error) {
            if (seq === readSeq && !closed) {
                logger.warn('Project file could not be read', { ...fields, error });
                // A file read before stays as it shows; the next change or reconnect reads it again.
                loadFailed.value = !loaded.value;
            }
            return;
        }
        if (seq !== readSeq || closed) {
            return;
        }
        if (saveCount !== savesBefore) {
            // A save started meanwhile: this may be the file before it.
            void read();
            return;
        }
        loadFailed.value = false;
        takeReadResult(result);
        loaded.value = true;
    }

    function takeReadResult(result: ProjectFileReadResult) {
        if ('notFound' in result) {
            gone.value = true;
            clearTimers();
            return;
        }
        if ('text' in result) {
            if (gone.value && dirty.value) {
                // Back on disk, but the person's text is not: it stays read-only as it was.
                return;
            }
            gone.value = false;
            view.value = textView(path);
            tooLarge.value = false;
            takeDiskText(result.text);
            return;
        }
        if (dirty.value) {
            // No longer a text file: the person's text stays, as when the disk's text changed.
            disk.value = null;
            saveProblem.value = 'changedOnDisk';
            clearTimers();
            return;
        }
        gone.value = false;
        base.value = null;
        content.value = '';
        if ('binary' in result) {
            view.value = binaryView(path);
            tooLarge.value = false;
            updatedAt.value = result.binary.updatedAt;
        } else {
            view.value = 'elsewhere';
            tooLarge.value = true;
        }
    }

    /** The one way a change on disk is taken, from a read or a stale save. */
    function takeDiskText(text: ProjectTextFile) {
        updatedAt.value = text.updatedAt;
        if (base.value?.version === text.version) {
            // What was last read or written: nothing changed on disk, or a change waiting for the merge was undone.
            if (saveProblem.value === 'changedOnDisk') {
                disk.value = null;
                saveProblem.value = null;
                if (dirty.value) {
                    scheduleSave();
                }
            }
            return;
        }
        if (!dirty.value || text.content === content.value) {
            base.value = text;
            content.value = text.content;
            disk.value = null;
            if (saveProblem.value === 'changedOnDisk') {
                saveProblem.value = null;
            }
            return;
        }
        // Merged from the text both started from, also when a conflict waits: a newer disk text replaces the older one.
        assert(base.value, 'Unsaved changes with nothing read or written');
        const merge = { base: base.value.content, mine: content.value, theirs: text.content };
        const merged = view.value === 'markdown' ? mergeMarkdown(merge) : mergeText(merge);
        if (merged === null) {
            // The person's text stays as it is, unsaved, until they keep it or take the disk's.
            disk.value = text;
            saveProblem.value = 'changedOnDisk';
            clearTimers();
            return;
        }
        base.value = text;
        content.value = merged;
        disk.value = null;
        saveProblem.value = null;
        if (dirty.value) {
            // Saved on the disk's version; from inside a stale save, it goes once that save is answered.
            scheduleSave();
        }
    }
}

/** @__NO_SIDE_EFFECTS__ */
function textView(path: string): ProjectFileView {
    switch (fileExtension(path)) {
        case 'md':
        case 'markdown':
            return 'markdown';
        case 'csv':
            return 'csv';
        default:
            return 'text';
    }
}

/**
 * An SVG is not previewed: one the agent wrote can carry a script.
 * @__NO_SIDE_EFFECTS__
 */
function binaryView(path: string): ProjectFileView {
    const extension = fileExtension(path);
    if (IMAGE_EXTENSIONS.has(extension)) {
        return 'image';
    }
    return extension === 'pdf' ? 'pdf' : 'elsewhere';
}
