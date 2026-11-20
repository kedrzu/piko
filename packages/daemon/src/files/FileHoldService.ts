import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';

import { OpencodePermissionListCommand } from '@piko/opencode/OpencodePermissionListCommand.js';
import type { OpencodePermissionRequest } from '@piko/opencode/OpencodePermissionListCommand.js';
import { OpencodePermissionReplyCommand } from '@piko/opencode/OpencodePermissionReplyCommand.js';

import { toAgentDir } from '../conversations/utils/toAgentDir.js';
import { ProjectService } from '../projects/ProjectService.js';
import { Clock } from '../utils/Clock.js';
import { AgentPathService } from './AgentPathService.js';
import { FileAgentStateService } from './FileAgentStateService.js';
import type { ProjectFileRef } from './FileAgentStateService.js';
import { FileTypingService } from './FileTypingService.js';
import { toFileKey } from './toFileKey.js';

/**
 * The daemon's answers to the agent's permission requests: the person never sees one (design D28). OpenCode asks
 * before every file edit (`docs/decisions/agent-holds-file-edits-through-opencode-permissions.md`); every request is
 * allowed `once` at once, except an edit of a project file the person saved within the last minute
 * (`FileTypingService`). That one is held, its files `waiting`, until a minute passes after her last save of them, she
 * releases a file of it, or its conversation's run ends. Nothing here throws: a request it cannot answer is logged, and
 * answered when the agent's feed opens again.
 */
export interface FileHoldServiceShape {
    /** The agent asks for a permission. */
    permissionAsked(request: OpencodePermissionRequest): Promise<void>;
    /**
     * The agent's feed opened: the requests pending in every project folder are handled like new ones (one still held
     * stays held), and a hold whose request is no longer pending is dropped.
     */
    feedOpened(): Promise<void>;
    /** A conversation's run ended or was stopped: its held requests are answered. */
    runEnded(sessionId: string): Promise<void>;
    /**
     * The person lets the agent write `file` now: every request holding it is answered, and her saves of it are
     * forgotten, so it is not held again. `false` when none held it.
     */
    release(file: ProjectFileRef): Promise<boolean>;
}

/** How long after the person's last save of a file the agent's change to it is held. */
export const HOLD_MS = 60_000;

/** A request held. */
interface Hold {
    request: OpencodePermissionRequest;
    /** Its project files the person saved recently: the ones `waiting`. */
    files: ProjectFileRef[];
    cancelTimer: () => void;
}

/** The answers to the agent's permission requests. */
export const FileHoldService = defineService({
    name: 'FileHoldService',
    deps: {
        logger: Logger,
        clock: Clock,
        projects: ProjectService,
        agentPaths: AgentPathService,
        fileAgents: FileAgentStateService,
        typing: FileTypingService,
        listPermissions: OpencodePermissionListCommand,
        replyPermission: OpencodePermissionReplyCommand,
    },
    setup({
        logger,
        clock,
        projects,
        agentPaths,
        fileAgents,
        typing,
        listPermissions,
        replyPermission,
    }): FileHoldServiceShape {
        /** By permission id. */
        const holds = new Map<string, Hold>();

        return { permissionAsked, feedOpened, runEnded, release };

        async function permissionAsked(request: OpencodePermissionRequest) {
            if (holds.has(request.permissionId)) {
                return;
            }
            const files = await findTypedFiles(request);
            // Asked again while the files were looked up (a pending list right after the event).
            if (holds.has(request.permissionId)) {
                return;
            }
            if (files.length === 0) {
                await answer(request);
                return;
            }
            const hold: Hold = { request, files, cancelTimer: () => undefined };
            holds.set(request.permissionId, hold);
            scheduleEnd(hold);
            fileAgents.holdStarted({ conversationId: request.sessionId, holdId: request.permissionId, files });
            logger.info('Agent edit held while the person types', {
                sessionId: request.sessionId,
                permissionId: request.permissionId,
                fileCount: files.length,
            });
        }

        async function feedOpened() {
            const pending: OpencodePermissionRequest[] = [];
            let complete = true;
            try {
                for (const project of await projects.list()) {
                    try {
                        pending.push(...(await listPermissions(toAgentDir(project.dir))));
                    } catch (error) {
                        complete = false;
                        logger.warn('Pending agent permissions could not be listed', { projectId: project.id, error });
                    }
                }
            } catch (error) {
                logger.warn('Projects could not be listed, pending agent permissions not answered', { error });
                return;
            }

            // A hold is dropped only when every folder was listed: one missing from a failed list may still wait.
            if (complete) {
                const ids = new Set(pending.map(request => request.permissionId));
                for (const hold of holds.values()) {
                    if (!ids.has(hold.request.permissionId)) {
                        drop(hold);
                    }
                }
            }
            for (const request of pending) {
                await permissionAsked(request);
            }
        }

        async function runEnded(sessionId: string) {
            for (const hold of holds.values()) {
                if (hold.request.sessionId === sessionId) {
                    await end(hold);
                }
            }
        }

        async function release(file: ProjectFileRef) {
            typing.forget(file);
            const key = toFileKey(file);
            const released = [...holds.values()].filter(hold => hold.files.some(other => toFileKey(other) === key));
            for (const hold of released) {
                await end(hold);
            }
            return released.length > 0;
        }

        /**
         * The project files of an edit request the person saved within `HOLD_MS`; none for another action or a
         * resource that is no project file.
         */
        async function findTypedFiles(request: OpencodePermissionRequest) {
            if (request.action !== 'edit') {
                return [];
            }
            try {
                const files = await agentPaths.toProjectFiles(request.sessionId, request.resources);
                return files.filter(file => quietAt([file]) !== undefined);
            } catch (error) {
                logger.warn('Agent permission resources could not be resolved, answered', {
                    permissionId: request.permissionId,
                    error,
                });
                return [];
            }
        }

        /** When `HOLD_MS` will have passed since the person's last save of any of `files`; `undefined` if it has. */
        function quietAt(files: ProjectFileRef[]) {
            let last: number | undefined;
            for (const file of files) {
                const written = typing.lastWrite(file);
                if (written != null && (last == null || written > last)) {
                    last = written;
                }
            }
            if (last == null || last + HOLD_MS <= clock.now()) {
                return undefined;
            }
            return last + HOLD_MS;
        }

        /** Ends the hold once the person has not saved its files for `HOLD_MS`: a later save puts the end off. */
        function scheduleEnd(hold: Hold) {
            const at = quietAt(hold.files);
            if (at === undefined) {
                void end(hold);
                return;
            }
            hold.cancelTimer = clock.setTimeout(() => {
                if (holds.get(hold.request.permissionId) === hold) {
                    scheduleEnd(hold);
                }
            }, at - clock.now());
        }

        /** Stops holding the request and answers it, unless it already ended. */
        async function end(hold: Hold) {
            if (!drop(hold)) {
                return;
            }
            logger.info('Held agent edit released', {
                sessionId: hold.request.sessionId,
                permissionId: hold.request.permissionId,
            });
            await answer(hold.request);
        }

        /** Stops holding the request without answering it; `false` when it already ended. */
        function drop(hold: Hold) {
            if (holds.get(hold.request.permissionId) !== hold) {
                return false;
            }
            holds.delete(hold.request.permissionId);
            hold.cancelTimer();
            fileAgents.holdEnded(hold.request.permissionId);
            return true;
        }

        /** Allows the request once. A request no longer pending (answered, or gone with its run) needs no answer. */
        async function answer(request: OpencodePermissionRequest) {
            const { sessionId, permissionId } = request;
            try {
                const result = await replyPermission({ sessionId, permissionId, decision: 'once' });
                if (result === 'notFound') {
                    logger.debug('Agent permission no longer pending, not answered', { sessionId, permissionId });
                    return;
                }
                logger.debug('Agent permission allowed', { sessionId, permissionId, action: request.action });
            } catch (error) {
                // The agent waits until its feed opens again, when the request is listed and answered.
                logger.warn('Agent permission could not be answered', { sessionId, permissionId, error });
            }
        }
    },
});
