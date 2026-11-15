import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { ref } from 'vue';

import type { DaemonEvent, FileAgentState } from '@poweragents/common/api/DaemonEventTypes.js';
import { ProjectFileReleaseEndpoint } from '@poweragents/common/api/ProjectFileReleaseEndpoint.js';

import { DaemonClient } from '@/daemon/DaemonClient.js';
import { DaemonEventStream } from '@/daemon/DaemonEventStream.js';

/** What the agent is doing to a project file. */
export interface FileAgent {
    /** The conversation whose agent does it: what Stop the agent stops. */
    conversationId: string;
    state: FileAgentState;
}

/**
 * What the agent is doing to each project file, as the daemon streams it, and letting it write a file it waits on. The
 * daemon sends every current state when the app connects, so a reconnect forgets what was held and takes them again.
 * Resolve it before the event stream starts, or the states sent on connecting are missed.
 */
export const FileAgentStore = defineService({
    name: 'FileAgentStore',
    deps: { events: DaemonEventStream, daemon: DaemonClient, logger: Logger },
    setup({ events, daemon, logger }) {
        /** By project id and path; a file the agent is doing nothing to is absent. */
        const files = ref(new Map<string, FileAgent>());

        events.event.on(onEvent);

        return { get, release };

        /** What the agent is doing to the file now; `null` when nothing. */
        function get(projectId: string, path: string): FileAgent | null {
            return files.value.get(fileKey(projectId, path)) ?? null;
        }

        /**
         * Lets the agent write the file now, if it waits because the person typed in it: when she asks, and when she
         * closes the file. A failure is logged; the daemon lets it write a minute after her last save anyway.
         */
        async function release(projectId: string, path: string) {
            try {
                await daemon(ProjectFileReleaseEndpoint, { projectId, path });
            } catch (error) {
                logger.warn('Project file not released to the agent', { projectId, path, error });
            }
        }

        function onEvent(event: DaemonEvent) {
            switch (event.type) {
                case 'fileAgentChanged': {
                    const key = fileKey(event.projectId, event.path);
                    if (event.state === null) {
                        files.value.delete(key);
                    } else {
                        files.value.set(key, { conversationId: event.conversationId, state: event.state });
                    }
                    break;
                }
                case 'streamRestored':
                    // The daemon forgot the agent's calls of the gap: no file is `writing` any more. A held change
                    // stays held (the daemon owns the hold, and says when it ends).
                    for (const [key, agent] of files.value) {
                        if (agent.state === 'writing') {
                            files.value.delete(key);
                        }
                    }
                    break;
                case 'projectsChanged':
                case 'projectFilesChanged':
                case 'memoryChanged':
                case 'pluginsChanged':
                case 'pluginInstalled':
                case 'conversationCreated':
                case 'conversationRenamed':
                case 'runningChanged':
                case 'textDelta':
                case 'stepStarted':
                case 'stepFinished':
                case 'stepFailed':
                case 'runFinished':
                    break;
                default:
                    assertNever(event);
            }
        }
    },
});

function fileKey(projectId: string, path: string) {
    return `${projectId}\0${path}`;
}
