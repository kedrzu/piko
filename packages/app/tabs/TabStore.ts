import { defineService } from '@nzyme/ioc/Service.js';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { computed, reactive, ref, watch } from 'vue';
import type { RouteLocationNormalizedLoaded, RouteLocationRaw } from 'vue-router';

import { ProjectFileLocateEndpoint } from '@piko/common/api/ProjectFileLocateEndpoint.js';
import type { Conversation } from '@piko/common/api/ConversationTypes.js';
import type { Project } from '@piko/common/api/ProjectTypes.js';

import { ConversationStore } from '@/conversations/ConversationStore.js';
import { DaemonClient } from '@/daemon/DaemonClient.js';
import { ProjectStore } from '@/projects/ProjectStore.js';

/** Where the open tabs are kept, so they come back after a restart. */
const TABS_KEY = 'piko.tabs';

/** What a tab opens. One tab per target: its kind with its project and conversation or file. */
export type Tab =
    | {
          kind: 'conversation';
          projectId: string;
          conversationId: string;
          /**
           * The title last seen, so a conversation of a project not open now is named without loading its list; `null`
           * while it has none.
           */
          title: string | null;
      }
    | { kind: 'newConversation'; projectId: string }
    | { kind: 'file'; projectId: string; path: string }
    | { kind: 'memory' };

/**
 * The tabs open in the main area, in their order, as editors keep them: the route's screen opens its tab, remembered
 * across restarts. A tab whose project is gone is dropped once the projects are listed, and one of a conversation gone
 * once its project's conversations are; a file tab whose file is gone is dropped when the app loads, checked once with
 * the daemon (a failed check keeps the tab); a conversation's title follows the open project's list.
 */
export const TabStore = defineService({
    name: 'TabStore',
    deps: { projects: ProjectStore, conversations: ConversationStore, daemon: DaemonClient },
    setup({ projects, conversations, daemon }) {
        const tabs = ref<readonly Tab[]>(readTabs());
        let filesChecked = false;

        const state = reactive({
            tabs: computed(() => tabs.value),
        });

        watch(() => projects.state.projects, dropGoneProjects, { immediate: true });
        watch(() => conversations.state.conversations, followTitles);
        conversations.loaded.on(dropGoneConversations);

        return { state, targetOf, keyOf, routeOf, open, start, close };

        /** The tab of the screen a route shows; `null` for one without a tab (home). */
        function targetOf(route: RouteLocationNormalizedLoaded): Tab | null {
            const projectId = String(route.params['projectId']);
            switch (route.name) {
                case 'memory':
                    return { kind: 'memory' };
                case 'project':
                    return { kind: 'newConversation', projectId };
                case 'conversation':
                    return {
                        kind: 'conversation',
                        projectId,
                        conversationId: String(route.params['conversationId']),
                        title: null,
                    };
                case 'file': {
                    const path = route.query['path'];
                    return typeof path === 'string' ? { kind: 'file', projectId, path } : null;
                }
                default:
                    return null;
            }
        }

        /** The tab's identity: two tabs with one key open the same thing. */
        function keyOf(tab: Tab) {
            switch (tab.kind) {
                case 'memory':
                    return 'memory';
                case 'newConversation':
                    return `newConversation:${tab.projectId}`;
                case 'conversation':
                    return `conversation:${tab.projectId}:${tab.conversationId}`;
                case 'file':
                    return `file:${tab.projectId}:${tab.path}`;
                default:
                    return assertNever(tab);
            }
        }

        /** The screen a tab shows. */
        function routeOf(tab: Tab): RouteLocationRaw {
            switch (tab.kind) {
                case 'memory':
                    return { name: 'memory' };
                case 'newConversation':
                    return { name: 'project', params: { projectId: tab.projectId } };
                case 'conversation':
                    return {
                        name: 'conversation',
                        params: { projectId: tab.projectId, conversationId: tab.conversationId },
                    };
                case 'file':
                    return { name: 'file', params: { projectId: tab.projectId }, query: { path: tab.path } };
                default:
                    return assertNever(tab);
            }
        }

        /** Opens a tab at the end, unless it is open already. */
        function open(tab: Tab) {
            const key = keyOf(tab);
            if (tabs.value.some(other => keyOf(other) === key)) {
                return;
            }
            save([
                ...tabs.value,
                tab.kind === 'conversation' ? { ...tab, title: titleOf(tab.projectId, tab.conversationId) } : tab,
            ]);
        }

        /**
         * A conversation started from its project's new conversation tab takes that tab's place: it is what the person
         * started there. Call it before showing the conversation.
         */
        function start(projectId: string, conversationId: string) {
            const index = tabs.value.findIndex(tab => tab.kind === 'newConversation' && tab.projectId === projectId);
            if (index !== -1) {
                const started: Tab = {
                    kind: 'conversation',
                    projectId,
                    conversationId,
                    title: titleOf(projectId, conversationId),
                };
                save(tabs.value.with(index, started));
            }
        }

        /** Closes a tab; returns the tab beside it (the one to its right, else to its left) to show in its place. */
        function close(key: string): Tab | undefined {
            const index = tabs.value.findIndex(tab => keyOf(tab) === key);
            if (index === -1) {
                return undefined;
            }
            const next = tabs.value.toSpliced(index, 1);
            save(next);
            return next[index] ?? next[index - 1];
        }

        function titleOf(projectId: string, conversationId: string) {
            return conversations.state.projectId === projectId
                ? (conversations.find(conversationId)?.title ?? null)
                : null;
        }

        function dropGoneProjects(list: readonly Project[] | null) {
            if (list === null) {
                return;
            }
            const ids = new Set(list.map(project => project.id));
            const kept = tabs.value.filter(tab => tab.kind === 'memory' || ids.has(tab.projectId));
            if (kept.length !== tabs.value.length) {
                save(kept);
            }
            if (!filesChecked) {
                filesChecked = true;
                void dropGoneFiles();
            }
        }

        /** Checks the stored file tabs once, at load; a tab is dropped only on a definite `notFound`. */
        async function dropGoneFiles() {
            const gone = new Set<string>();
            await Promise.all(
                tabs.value.map(async tab => {
                    if (tab.kind !== 'file') {
                        return;
                    }
                    try {
                        const located = await daemon(ProjectFileLocateEndpoint, {
                            projectId: tab.projectId,
                            path: tab.path,
                        });
                        if ('notFound' in located) {
                            gone.add(keyOf(tab));
                        }
                    } catch {
                        // The daemon could not answer: the file may well be there.
                    }
                }),
            );
            const kept = tabs.value.filter(tab => !gone.has(keyOf(tab)));
            if (kept.length !== tabs.value.length) {
                save(kept);
            }
        }

        function dropGoneConversations(projectId: string, list: readonly Conversation[]) {
            const ids = new Set(list.map(conversation => conversation.id));
            const kept = tabs.value.filter(
                tab => tab.kind !== 'conversation' || tab.projectId !== projectId || ids.has(tab.conversationId),
            );
            if (kept.length !== tabs.value.length) {
                save(kept);
            }
        }

        /** Remembers the titles the open project's list has now. */
        function followTitles() {
            let changed = false;
            const next = tabs.value.map(tab => {
                if (tab.kind !== 'conversation' || conversations.state.projectId !== tab.projectId) {
                    return tab;
                }
                const title = conversations.find(tab.conversationId)?.title;
                if (title === undefined || title === tab.title) {
                    return tab;
                }
                changed = true;
                return { ...tab, title };
            });
            if (changed) {
                save(next);
            }
        }

        function save(next: readonly Tab[]) {
            tabs.value = next;
            localStorage.setItem(TABS_KEY, JSON.stringify(next));
        }
    },
});

/** The tabs kept in storage; what is not a tab (an older shape, a hand edit) is left out. */
function readTabs(): Tab[] {
    let value: unknown;
    try {
        value = JSON.parse(localStorage.getItem(TABS_KEY) ?? '[]');
    } catch {
        return [];
    }
    if (!Array.isArray(value)) {
        return [];
    }
    const tabs: Tab[] = [];
    for (const item of value) {
        const tab = parseTab(item);
        if (tab) {
            tabs.push(tab);
        }
    }
    return tabs;
}

function parseTab(item: unknown): Tab | null {
    if (typeof item !== 'object' || item === null) {
        return null;
    }
    const projectId: unknown = Reflect.get(item, 'projectId');
    switch (Reflect.get(item, 'kind')) {
        case 'memory':
            return { kind: 'memory' };
        case 'newConversation':
            return typeof projectId === 'string' ? { kind: 'newConversation', projectId } : null;
        case 'conversation': {
            const conversationId: unknown = Reflect.get(item, 'conversationId');
            const title: unknown = Reflect.get(item, 'title');
            return typeof projectId === 'string' && typeof conversationId === 'string'
                ? { kind: 'conversation', projectId, conversationId, title: typeof title === 'string' ? title : null }
                : null;
        }
        case 'file': {
            const path: unknown = Reflect.get(item, 'path');
            return typeof projectId === 'string' && typeof path === 'string' ? { kind: 'file', projectId, path } : null;
        }
        default:
            return null;
    }
}
