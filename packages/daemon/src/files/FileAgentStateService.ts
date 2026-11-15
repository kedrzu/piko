import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { assert } from '@nzyme/utils/assert.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';

import type { FileAgentChangedEvent, FileAgentState } from '@poweragents/common/api/DaemonEventTypes.js';

import { toFileKey } from './toFileKey.js';

/** A file inside a project. */
export interface ProjectFileRef {
    projectId: string;
    /** Relative to the project's folder, with `/`. */
    path: string;
}

/** Params of `FileAgentStateServiceShape.toolStarted()`. */
export interface FileAgentToolStartedParams {
    conversationId: string;
    callId: string;
    /** The files the call writes. */
    files: ProjectFileRef[];
}

/** Params of `FileAgentStateServiceShape.holdStarted()`. */
export interface FileAgentHoldStartedParams {
    conversationId: string;
    /** The permission request held. */
    holdId: string;
    /** The files the held change writes. */
    files: ProjectFileRef[];
}

/**
 * What the agent is doing to each project file, for the daemon's event stream: the one owner of that state. A file is
 * `waiting` while the agent's change to it is held (`FileHoldService`), else `writing` while a tool call that writes it
 * runs, from its start until it finishes or fails, its run ends, or the agent's feed is restored (whatever happened in
 * the gap is unknown, so nothing stays locked). Each change of a file's state is sent once.
 */
export interface FileAgentStateServiceShape {
    /**
     * Calls `listener` with every file whose state is not `null` now, then with every change from now on, until the
     * returned function is called or the listener throws: a client that connects learns the current states at once.
     */
    listen(listener: (event: FileAgentChangedEvent) => void): () => void;
    /** A tool call that writes `files` started. */
    toolStarted(params: FileAgentToolStartedParams): void;
    /** A tool call finished or failed. */
    toolEnded(conversationId: string, callId: string): void;
    /** A conversation's run ended: none of its calls runs any more. */
    runEnded(conversationId: string): void;
    /** Forgets every call: the agent's feed was down, and what ran meanwhile is unknown. Holds stay. */
    reset(): void;
    /** The agent's change to `files` is held: they are `waiting`. */
    holdStarted(params: FileAgentHoldStartedParams): void;
    /** The hold ended: its files are `writing` again while their call runs. */
    holdEnded(holdId: string): void;
}

/** A tool call running that writes files, or a held change. */
interface FileWork {
    conversationId: string;
    files: ProjectFileRef[];
}

/** The agent's work on project files. */
export const FileAgentStateService = defineService({
    name: 'FileAgentStateService',
    deps: { logger: Logger },
    setup({ logger }): FileAgentStateServiceShape {
        const emitter = createEventEmitter<[event: FileAgentChangedEvent]>();
        /** The running calls, by conversation and call id. */
        const running = new Map<string, FileWork>();
        /** The held changes, by hold id. */
        const held = new Map<string, FileWork>();
        /** The state last sent, by file; a file in `null` state is absent. */
        const sent = new Map<string, FileAgentChangedEvent>();

        return { listen, toolStarted, toolEnded, runEnded, reset, holdStarted, holdEnded };

        function listen(listener: (event: FileAgentChangedEvent) => void) {
            let listening = true;
            for (const event of sent.values()) {
                listener(event);
            }
            emitter.event.on(guarded);
            return stop;

            // A listener that throws (a client's closed connection) is dropped, so it never stops the others' events.
            function guarded(event: FileAgentChangedEvent) {
                if (!listening) {
                    return;
                }
                try {
                    listener(event);
                } catch (error) {
                    logger.warn('File agent listener failed, dropped', { error });
                    stop();
                }
            }

            function stop() {
                listening = false;
                emitter.event.off(guarded);
            }
        }

        function toolStarted({ conversationId, callId, files }: FileAgentToolStartedParams) {
            if (files.length === 0) {
                return;
            }
            running.set(callKey(conversationId, callId), { conversationId, files });
            update(files);
        }

        function toolEnded(conversationId: string, callId: string) {
            const key = callKey(conversationId, callId);
            const call = running.get(key);
            if (!call) {
                return;
            }
            running.delete(key);
            update(call.files);
        }

        function runEnded(conversationId: string) {
            const files: ProjectFileRef[] = [];
            for (const [key, call] of running) {
                if (call.conversationId === conversationId) {
                    running.delete(key);
                    files.push(...call.files);
                }
            }
            update(files);
        }

        function reset() {
            running.clear();
            update([...sent.values()]);
        }

        function holdStarted({ conversationId, holdId, files }: FileAgentHoldStartedParams) {
            held.set(holdId, { conversationId, files });
            update(files);
        }

        function holdEnded(holdId: string) {
            const hold = held.get(holdId);
            if (!hold) {
                return;
            }
            held.delete(holdId);
            update(hold.files);
        }

        /** Sends the state of each file that changed. */
        function update(files: ProjectFileRef[]) {
            for (const file of files) {
                const key = toFileKey(file);
                const next = stateOf(file);
                const last = sent.get(key);
                if (last?.conversationId === next?.conversationId && last?.state === next?.state) {
                    continue;
                }
                if (next) {
                    sent.set(key, next);
                    emitter.emit(next);
                    continue;
                }
                // Changed to `null`, so it was sent before.
                assert(last);
                sent.delete(key);
                emitter.emit({ ...last, state: null });
            }
        }

        /**
         * The file's state: `waiting` by the latest hold of a change to it, else `writing` by the latest call that
         * writes it, else `null`.
         */
        function stateOf(file: ProjectFileRef): FileAgentChangedEvent | null {
            const holder = findLatest(held, file);
            if (holder) {
                return toEvent(file, holder, 'waiting');
            }
            const writer = findLatest(running, file);
            return writer ? toEvent(file, writer, 'writing') : null;
        }
    },
});

function callKey(conversationId: string, callId: string) {
    return `${conversationId}\0${callId}`;
}

/** The work on `file` added last. */
function findLatest(works: Map<string, FileWork>, file: ProjectFileRef) {
    const key = toFileKey(file);
    let latest: FileWork | undefined;
    for (const work of works.values()) {
        if (work.files.some(other => toFileKey(other) === key)) {
            latest = work;
        }
    }
    return latest;
}

function toEvent(file: ProjectFileRef, work: FileWork, state: FileAgentState): FileAgentChangedEvent {
    return {
        type: 'fileAgentChanged',
        projectId: file.projectId,
        path: file.path,
        conversationId: work.conversationId,
        state,
    };
}
