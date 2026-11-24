import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';
import { computed, reactive, ref, shallowReactive } from 'vue';

import { ConversationCreateEndpoint } from '@piko/common/api/ConversationCreateEndpoint.js';
import { ConversationListEndpoint } from '@piko/common/api/ConversationListEndpoint.js';
import type { Conversation } from '@piko/common/api/ConversationTypes.js';
import type { DaemonEvent } from '@piko/common/api/DaemonEventTypes.js';

import { DaemonClient } from '@/daemon/DaemonClient.js';
import { DaemonEventStream } from '@/daemon/DaemonEventStream.js';

/**
 * Who started a conversation. `person`: the person, in this app or listed by the daemon without a schedule. `run`: a
 * schedule's run. `unknown`: announced by the daemon's event and not yet listed, so possibly a run whose schedule has
 * not recorded it yet; it settles when the list loads again, which a run's `schedulesChanged` brings.
 */
export type ConversationOrigin = 'person' | 'run' | 'unknown';

/**
 * The open project's conversations, newest first, as the sidebar lists them: loaded when a project opens and kept
 * current by the daemon's events (a conversation started elsewhere, a title the agent gave, the agent starting or
 * stopping, a schedule's run recorded). Only one project's list is held; opening another replaces it.
 */
export const ConversationStore = defineService({
    name: 'ConversationStore',
    deps: { daemon: DaemonClient, events: DaemonEventStream, logger: Logger },
    setup({ daemon, events, logger }) {
        const projectId = ref<string | null>(null);
        /** `null` until the open project's list is loaded. */
        const conversations = ref<Conversation[] | null>(null);
        /** Counts loads, so an answer for a project opened before is dropped. */
        let loadSeq = 0;
        /** A project's list as the daemon answered it; never a failed load's stand-in. */
        const loaded = createEventEmitter<[projectId: string, conversations: readonly Conversation[]]>();
        /** Conversations this app created: the person's, whatever an event or a list loaded before says. */
        const own = shallowReactive(new Set<string>());
        /** Conversations an event announced, of origin unknown until a list loaded after the event gives it. */
        const unknown = shallowReactive(new Set<string>());

        const state = reactive({
            /** The project whose conversations these are. */
            projectId: computed(() => projectId.value),
            /** Newest first; `null` until loaded. */
            conversations: computed(() => conversations.value),
        });

        events.event.on(onEvent);

        return { state, loaded: loaded.event, open, create, find, setRunning, originOf };

        /** Loads a project's conversations, unless they are the ones held already. */
        function open(id: string) {
            if (projectId.value === id) {
                return;
            }
            projectId.value = id;
            conversations.value = null;
            unknown.clear();
            void load();
        }

        /** Starts an empty conversation in the project and lists it first. */
        async function create(id: string) {
            const conversation = await daemon(ConversationCreateEndpoint, { projectId: id });
            // Its `conversationCreated` may have come first and left it unknown.
            own.add(conversation.id);
            unknown.delete(conversation.id);
            if (projectId.value === id) {
                upsert(conversation);
            }
            return conversation;
        }

        /** A conversation of the open project, if it is listed. */
        function find(id: string) {
            return conversations.value?.find(conversation => conversation.id === id);
        }

        /** Who started the conversation; the sidebar lists the person's, never one of unknown origin. */
        function originOf(conversation: Conversation): ConversationOrigin {
            if (conversation.scheduleId !== undefined) {
                return 'run';
            }
            if (own.has(conversation.id)) {
                return 'person';
            }
            return unknown.has(conversation.id) ? 'unknown' : 'person';
        }

        /** Marks a conversation running ahead of the daemon's event, when the app itself started its run. */
        function setRunning(id: string, running: boolean) {
            update(id, conversation => ({ ...conversation, running }));
        }

        async function load() {
            const id = projectId.value;
            if (id === null) {
                return;
            }
            const seq = ++loadSeq;
            // Only those announced before the list was asked for: a later one may be missing from it, or not yet
            // recorded as a run.
            const settled = [...unknown];
            try {
                const list = await daemon(ConversationListEndpoint, { projectId: id });
                if (seq === loadSeq) {
                    for (const conversationId of settled) {
                        unknown.delete(conversationId);
                    }
                    conversations.value = list;
                    loaded.emit(id, list);
                }
            } catch (error) {
                // The sidebar keeps showing the project alone; the next open or reconnect tries again.
                logger.warn('Conversations could not be loaded', { projectId: id, error });
                if (seq === loadSeq) {
                    conversations.value = [];
                }
            }
        }

        function onEvent(event: DaemonEvent) {
            switch (event.type) {
                case 'conversationCreated':
                    if (event.projectId === projectId.value && !find(event.conversationId)) {
                        if (!own.has(event.conversationId)) {
                            unknown.add(event.conversationId);
                        }
                        upsert({
                            id: event.conversationId,
                            title: event.title,
                            updatedAt: Date.now(),
                            running: false,
                            provider: event.provider,
                        });
                    }
                    break;
                case 'conversationRenamed':
                    update(event.conversationId, conversation => ({ ...conversation, title: event.title }));
                    break;
                case 'runningChanged':
                    update(event.conversationId, conversation => ({ ...conversation, running: event.running }));
                    break;
                case 'streamRestored':
                    void load();
                    break;
                case 'textDelta':
                case 'stepStarted':
                case 'stepFinished':
                case 'stepFailed':
                case 'runFinished':
                    // The open conversation's.
                    break;
                case 'schedulesChanged':
                    // A run recorded: the list says which conversations are runs.
                    if (event.projectId === projectId.value) {
                        void load();
                    }
                    break;
                case 'projectsChanged':
                case 'projectFilesChanged':
                case 'fileAgentChanged':
                case 'memoryChanged':
                case 'pluginsChanged':
                case 'pluginInstalled':
                    // Not about conversations.
                    break;
                default:
                    assertNever(event);
            }
        }

        function upsert(conversation: Conversation) {
            const others = (conversations.value ?? []).filter(item => item.id !== conversation.id);
            conversations.value = [conversation, ...others];
        }

        function update(id: string, change: (conversation: Conversation) => Conversation) {
            if (conversations.value?.some(conversation => conversation.id === id)) {
                conversations.value = conversations.value.map(conversation =>
                    conversation.id === id ? change(conversation) : conversation,
                );
            }
        }
    },
});
