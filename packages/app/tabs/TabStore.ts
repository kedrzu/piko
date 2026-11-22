import { defineService } from '@nzyme/ioc/Service.js';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { computed, reactive, ref, watch } from 'vue';
import type { RouteLocationNormalizedLoaded, RouteLocationRaw } from 'vue-router';

import { ProjectFileLocateEndpoint } from '@piko/common/api/ProjectFileLocateEndpoint.js';
import type { Conversation } from '@piko/common/api/ConversationTypes.js';
import type { Project } from '@piko/common/api/ProjectTypes.js';
import type { Schedule, ScheduleRef } from '@piko/common/api/ScheduleTypes.js';

import { ConversationStore } from '@/conversations/ConversationStore.js';
import { DaemonClient } from '@/daemon/DaemonClient.js';
import { ProjectStore } from '@/projects/ProjectStore.js';
import { ScheduleStore } from '@/schedules/ScheduleStore.js';

import { parseStoredTabs } from './parseStoredTabs.js';

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
    | {
          kind: 'history';
          projectId: string;
          /** The filter last shown (`?schedule=`), so coming back to the tab keeps it; `null` for all. */
          filter: string | null;
      }
    | { kind: 'file'; projectId: string; path: string }
    | { kind: 'memory' }
    | { kind: 'schedules' }
    | {
          kind: 'schedule';
          projectId: string;
          scheduleId: string;
          /** The name last seen, so the tab is named before the schedules are listed; `null` until seen. */
          title: string | null;
      };

/**
 * The tabs open in the main area, in their order, as editors keep them: the route's screen opens its tab, remembered
 * across restarts. A tab whose project is gone is dropped once the projects are listed, and one of a conversation gone
 * once its project's conversations are; a file tab whose file is gone is dropped when the app loads, checked once with
 * the daemon (a failed check keeps the tab); a conversation's title follows the open project's list. A schedule's tab
 * is named after the schedule and dropped once the schedules listed lack it, unless its screen shows (it then says the
 * schedule is gone).
 */
export const TabStore = defineService({
    name: 'TabStore',
    deps: { projects: ProjectStore, conversations: ConversationStore, schedules: ScheduleStore, daemon: DaemonClient },
    setup({ projects, conversations, schedules, daemon }) {
        const tabs = ref<readonly Tab[]>(parseStoredTabs(localStorage.getItem(TABS_KEY)));
        let filesChecked = false;

        const state = reactive({
            tabs: computed(() => tabs.value),
        });

        watch(() => projects.state.projects, dropGoneProjects, { immediate: true });
        watch(() => conversations.state.conversations, followTitles);
        watch(() => schedules.state.schedules, followScheduleTitles);
        conversations.loaded.on(dropGoneConversations);

        return { state, targetOf, keyOf, routeOf, open, start, close, dropGoneSchedules };

        /** The tab of the screen a route shows; `null` for one without a tab (home). */
        function targetOf(route: RouteLocationNormalizedLoaded): Tab | null {
            const projectId = String(route.params['projectId']);
            switch (route.name) {
                case 'memory':
                    return { kind: 'memory' };
                case 'schedules':
                    return { kind: 'schedules' };
                case 'schedule':
                    return { kind: 'schedule', projectId, scheduleId: String(route.params['scheduleId']), title: null };
                case 'project':
                    return { kind: 'newConversation', projectId };
                case 'history': {
                    const filter = route.query['schedule'];
                    return { kind: 'history', projectId, filter: typeof filter === 'string' ? filter : null };
                }
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
                case 'schedules':
                    return 'schedules';
                case 'schedule':
                    return `schedule:${tab.projectId}:${tab.scheduleId}`;
                case 'newConversation':
                    return `newConversation:${tab.projectId}`;
                case 'history':
                    // One per project, whatever it is filtered by.
                    return `history:${tab.projectId}`;
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
                case 'schedules':
                    return { name: 'schedules' };
                case 'schedule':
                    return { name: 'schedule', params: { projectId: tab.projectId, scheduleId: tab.scheduleId } };
                case 'newConversation':
                    return { name: 'project', params: { projectId: tab.projectId } };
                case 'history':
                    return {
                        name: 'history',
                        params: { projectId: tab.projectId },
                        query: tab.filter === null ? {} : { schedule: tab.filter },
                    };
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

        /** Opens a tab at the end, unless it is open already; a history tab open already takes the filter shown now. */
        function open(tab: Tab) {
            const key = keyOf(tab);
            const index = tabs.value.findIndex(other => keyOf(other) === key);
            if (index === -1) {
                save([...tabs.value, withTitle(tab)]);
                return;
            }
            const held = tabs.value[index];
            if (tab.kind === 'history' && held?.kind === 'history' && held.filter !== tab.filter) {
                save(tabs.value.with(index, tab));
            }
        }

        /**
         * Drops the tabs of the schedules no longer listed (the agent removed them), except the one whose screen shows
         * now: it says the schedule is gone, and its tab goes once the person leaves it. Nothing while the schedules
         * are not listed.
         */
        function dropGoneSchedules(shownKey: string | undefined) {
            const list = schedules.state.schedules;
            if (list === null) {
                return;
            }
            const kept = tabs.value.filter(
                tab => tab.kind !== 'schedule' || keyOf(tab) === shownKey || findSchedule(list, tab) !== undefined,
            );
            if (kept.length !== tabs.value.length) {
                save(kept);
            }
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

        function withTitle(tab: Tab): Tab {
            switch (tab.kind) {
                case 'conversation':
                    return { ...tab, title: titleOf(tab.projectId, tab.conversationId) };
                case 'schedule':
                    return { ...tab, title: findSchedule(schedules.state.schedules ?? [], tab)?.name ?? null };
                default:
                    return tab;
            }
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
            const kept = tabs.value.filter(
                tab => tab.kind === 'memory' || tab.kind === 'schedules' || ids.has(tab.projectId),
            );
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

        /** Remembers the names the listed schedules have now. */
        function followScheduleTitles(list: readonly Schedule[] | null) {
            if (list === null) {
                return;
            }
            let changed = false;
            const next = tabs.value.map(tab => {
                if (tab.kind !== 'schedule') {
                    return tab;
                }
                const name = findSchedule(list, tab)?.name;
                if (name === undefined || name === tab.title) {
                    return tab;
                }
                changed = true;
                return { ...tab, title: name };
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

function findSchedule(list: readonly Schedule[], target: ScheduleRef) {
    return list.find(schedule => schedule.projectId === target.projectId && schedule.id === target.scheduleId);
}
