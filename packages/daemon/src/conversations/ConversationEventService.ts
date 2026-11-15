import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';
import { createExponentialBackoff } from '@nzyme/utils/createExponentialBackoff.js';

import type { DaemonEvent } from '@poweragents/common/api/DaemonEventTypes.js';
import { OpencodeEventSubscribeCommand } from '@poweragents/opencode/OpencodeEventSubscribeCommand.js';
import type { OpencodeSessionEvent } from '@poweragents/opencode/OpencodeEventSubscribeCommand.js';

import { toAiProvider } from '../ai/utils/toAiProvider.js';
import { AgentPathService } from '../files/AgentPathService.js';
import { FileAgentStateService } from '../files/FileAgentStateService.js';
import { FileHoldService } from '../files/FileHoldService.js';
import { ProjectService } from '../projects/ProjectService.js';
import { Sandbox } from '../sandbox/Sandbox.js';
import { readWrittenPaths } from './utils/readWrittenPaths.js';
import { toAgentDir } from './utils/toAgentDir.js';
import { toConversationError } from './utils/toConversationError.js';
import { toConversationStep } from './utils/toConversationStep.js';

/**
 * What happens in the person's conversations, live, for the daemon's event stream. The daemon holds one feed of the
 * agent's events, started with the daemon (or by the first listener) and kept for the daemon's lifetime: it waits for a
 * ready sandbox and reconnects with backoff when it drops, then sends `streamRestored` once the feed is open again,
 * since what happened meanwhile was not streamed. It also tells `FileAgentStateService` which project files the agent's
 * tool calls write, and gives `FileHoldService` the agent's permission requests to answer.
 */
export interface ConversationEventServiceShape {
    /**
     * Starts the feed without a listener: the agent's permission requests are answered even with the app closed, or the
     * agent would stall on its next edit. Starting again does nothing.
     */
    start(): void;
    /** Calls `listener` with every event from now on, until the returned function is called or the listener throws. */
    listen(listener: (event: DaemonEvent) => void): () => void;
}

/** The longest wait between two attempts to reconnect the feed. */
const MAX_RECONNECT_DELAY_MS = 30_000;

/** The person's conversations, live. */
export const ConversationEventService = defineService({
    name: 'ConversationEventService',
    deps: {
        logger: Logger,
        projects: ProjectService,
        sandbox: Sandbox,
        subscribe: OpencodeEventSubscribeCommand,
        agentPaths: AgentPathService,
        fileAgents: FileAgentStateService,
        fileHolds: FileHoldService,
    },
    setup({ logger, projects, sandbox, subscribe, agentPaths, fileAgents, fileHolds }): ConversationEventServiceShape {
        const emitter = createEventEmitter<[event: DaemonEvent]>();
        let feed: Promise<void> | undefined;

        return { start, listen };

        function start() {
            feed ??= runFeed();
        }

        function listen(listener: (event: DaemonEvent) => void) {
            let listening = true;
            emitter.event.on(guarded);
            start();
            return stop;

            // A listener that throws (a client's closed connection) is dropped, so it never breaks the feed of the rest.
            function guarded(event: DaemonEvent) {
                if (!listening) {
                    return;
                }
                try {
                    listener(event);
                } catch (error) {
                    logger.warn('Conversation event listener failed, dropped', { error });
                    stop();
                }
            }

            function stop() {
                // The flag also silences it for the rest of an event being sent: the emitter still calls a listener
                // removed during that event.
                listening = false;
                emitter.event.off(guarded);
            }
        }

        async function runFeed() {
            const backoff = createExponentialBackoff({ maxDelay: MAX_RECONNECT_DELAY_MS });
            // The feed runs as long as the daemon does, so nothing ever aborts it.
            const signal = new AbortController().signal;
            let lostEvents = false;

            while (true) {
                await waitForReadySandbox();
                try {
                    for await (const event of subscribe(signal)) {
                        if (event.type === 'streamOpened') {
                            backoff.reset();
                            if (lostEvents) {
                                lostEvents = false;
                                logger.info('Agent event feed restored');
                                fileAgents.reset();
                                emitter.emit({ type: 'streamRestored' });
                            }
                            // Requests asked while the feed was down (or the daemon was not running) are answered too.
                            await fileHolds.feedOpened();
                            continue;
                        }
                        await trackFileAgents(event);
                        await forwardToHolds(event);
                        for (const mapped of await mapEvent(event)) {
                            emitter.emit(mapped);
                        }
                    }
                    logger.warn('Agent event feed ended, reconnecting');
                } catch (error) {
                    logger.warn('Agent event feed failed, reconnecting', { error, attempt: backoff.retries + 1 });
                }
                lostEvents = true;
                await backoff.backoff();
            }
        }

        async function waitForReadySandbox() {
            if (sandbox.getState().status === 'ready') {
                return;
            }
            const ready = Promise.withResolvers<void>();
            const onState = () => {
                if (sandbox.getState().status === 'ready') {
                    ready.resolve();
                }
            };
            sandbox.stateChanged.on(onState);
            try {
                await ready.promise;
            } finally {
                sandbox.stateChanged.off(onState);
            }
        }

        /** The agent's event as the conversation's events; most of the agent's events have none. */
        async function mapEvent(event: OpencodeSessionEvent): Promise<DaemonEvent[]> {
            const conversationId = event.sessionId;
            switch (event.type) {
                case 'sessionCreated': {
                    // A sub-session is the agent's own helper, not a conversation of the person's.
                    const projectId = event.parentId == null ? await findProjectId(event.directory) : undefined;
                    return projectId == null
                        ? []
                        : [
                              {
                                  type: 'conversationCreated',
                                  conversationId,
                                  projectId,
                                  title: event.title,
                                  provider: toAiProvider(event.providerId),
                              },
                          ];
                }
                case 'sessionRenamed':
                    return [{ type: 'conversationRenamed', conversationId, title: event.title }];
                case 'runStarted':
                    return [{ type: 'runningChanged', conversationId, running: true }];
                case 'textDelta':
                    return [{ type: 'textDelta', conversationId, messageId: event.messageId, delta: event.delta }];
                case 'toolStarted': {
                    const step = toConversationStep({
                        callId: event.callId,
                        toolName: event.name,
                        input: event.input,
                        status: 'running',
                    });
                    return [{ type: 'stepStarted', conversationId, step }];
                }
                case 'toolFinished':
                    return [{ type: 'stepFinished', conversationId, stepId: event.callId }];
                case 'toolFailed':
                    return [{ type: 'stepFailed', conversationId, stepId: event.callId, error: event.error.message }];
                case 'runFinished':
                    return [
                        {
                            type: 'runFinished',
                            conversationId,
                            outcome: event.outcome,
                            error: event.outcome === 'failed' ? toConversationError(event.error) : undefined,
                        },
                        { type: 'runningChanged', conversationId, running: false },
                    ];
                // A failed model step is retried or ends the run, which reports the error; the agent's permission
                // requests are the daemon's to answer (`FileHoldService`), never the person's.
                case 'stepFailed':
                case 'retryScheduled':
                case 'permissionAsked':
                    return [];
                default:
                    return assertNever(event, 'Unknown agent event');
            }
        }

        /** Tells `fileAgents` about the agent's tool calls that write project files, and when they end. */
        async function trackFileAgents(event: OpencodeSessionEvent) {
            switch (event.type) {
                case 'sessionCreated':
                    agentPaths.noteSession(event.sessionId, event.directory);
                    break;
                case 'toolStarted': {
                    const { kind } = toConversationStep({
                        callId: event.callId,
                        toolName: event.name,
                        input: event.input,
                        status: 'running',
                    });
                    const paths = readWrittenPaths(kind, event.input);
                    if (paths.length > 0) {
                        const files = await agentPaths.toProjectFiles(event.sessionId, paths);
                        fileAgents.toolStarted({ conversationId: event.sessionId, callId: event.callId, files });
                    }
                    break;
                }
                case 'toolFinished':
                case 'toolFailed':
                    fileAgents.toolEnded(event.sessionId, event.callId);
                    break;
                case 'runFinished':
                    fileAgents.runEnded(event.sessionId);
                    break;
                case 'sessionRenamed':
                case 'runStarted':
                case 'textDelta':
                case 'stepFailed':
                case 'retryScheduled':
                case 'permissionAsked':
                    break;
                default:
                    assertNever(event, 'Unknown agent event');
            }
        }

        /** Gives `fileHolds` the agent's permission requests and the ends of its runs. */
        async function forwardToHolds(event: OpencodeSessionEvent) {
            if (event.type === 'permissionAsked') {
                await fileHolds.permissionAsked(event);
            } else if (event.type === 'runFinished') {
                await fileHolds.runEnded(event.sessionId);
            }
        }

        /** The project whose folder the agent sees as `directory`; none for a folder that is not a project. */
        async function findProjectId(directory: string) {
            const all = await projects.list();
            return all.find(project => toAgentDir(project.dir) === directory)?.id;
        }
    },
});
