<!-- The app after the first run: Memory, Schedules (with how many) and the projects in the sidebar (App setup pinned first, a project not opened yet marked new) with the active tab's project, its conversations and its files, the open tabs, the screen of the route inside, and the new-project dialog. Starts the daemon's event stream. -->

<script lang="ts" setup>
import { NuxtPage } from '#components';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { provideContext } from '@nzyme/vue-utils/context.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { useRoute, useRouter } from 'nuxt/app';
import { computed, watch } from 'vue';

import AppShell from '@piko/ui/AppShell.vue';
import type { ProjectColor } from '@piko/ui/ProjectColor.js';
import ProjectSidebar from '@piko/ui/ProjectSidebar.vue';
import type { ProjectSidebarConversation, ProjectSidebarFile, ProjectSidebarItem } from '@piko/ui/ProjectSidebar.vue';
import TabBar from '@piko/ui/TabBar.vue';
import type { TabBarItem } from '@piko/ui/TabBar.vue';

import * as lc from '@/conversations/Conversations.loc.js';
import { ConversationStore } from '@/conversations/ConversationStore.js';
import { DaemonEventStream } from '@/daemon/DaemonEventStream.js';
import { FileAgentStore } from '@/files/FileAgentStore.js';
import { fileKind } from '@/files/fileKind.js';
import { fileTitle } from '@/files/fileTitle.js';
import { ProjectFileStore } from '@/files/ProjectFileStore.js';
import type { ProjectFileRow } from '@/files/ProjectFileStore.js';
import { ScheduleStore } from '@/schedules/ScheduleStore.js';
import { TabStore } from '@/tabs/TabStore.js';
import type { Tab } from '@/tabs/TabStore.js';

import * as l from './MainShell.loc.js';

import { MainShellContext } from './MainShellContext.js';
import NewProjectDialog from './NewProjectDialog.vue';
import { projectColor } from './projectColor.js';
import { ProjectStore } from './ProjectStore.js';
import ProjectsLoadFailed from './ProjectsLoadFailed.vue';

const store = useService(ProjectStore);
const conversationStore = useService(ConversationStore);
const fileStore = useService(ProjectFileStore);
// Before the event stream starts: the daemon sends what the agent is writing as soon as the app connects.
const fileAgents = useService(FileAgentStore);
const scheduleStore = useService(ScheduleStore);
const tabs = useService(TabStore);
const events = useService(DaemonEventStream);
const route = useRoute();
const router = useRouter();
const shell = provideContext(MainShellContext);
const t = useTranslate();
const memoryOpen = computed(() => route.name === 'memory');
const schedulesOpen = computed(() => route.name === 'schedules' || route.name === 'schedule');

const items = computed(() =>
  (store.state.projects ?? [])
    // Stable: the rest keep the daemon's order by name.
    .toSorted((a, b) => Number(b.role === 'appSetup') - Number(a.role === 'appSetup'))
    .map((project): ProjectSidebarItem => ({
      id: project.id,
      name: project.name,
      color: colorOf(project.id),
      to: { name: 'project', params: { projectId: project.id } },
      mark: project.role === 'appSetup' ? 'pinned' : store.isNew(project) ? 'new' : undefined,
    })),
);
/** The active tab: the route's screen. */
const activeTab = computed(() => tabs.targetOf(route));
const activeKey = computed(() => (activeTab.value ? tabs.keyOf(activeTab.value) : undefined));
const selected = computed(() => {
  const tab = activeTab.value;
  // A schedule's tab opens its project too: the schedule's runs are named after its conversations.
  const projectId = tab && tab.kind !== 'memory' && tab.kind !== 'schedules' ? tab.projectId : undefined;
  return items.value.find(item => item.id === projectId);
});
const selectedConversationId = computed(() =>
  route.name === 'conversation' ? String(route.params['conversationId']) : undefined,
);
const conversations = computed(() =>
  conversationStore.state.projectId === selected.value?.id
    ? (conversationStore.state.conversations ?? []).map((conversation): ProjectSidebarConversation => ({
        id: conversation.id,
        title: conversation.title ?? t(lc.untitled),
        to: { name: 'conversation', params: { projectId: selected.value?.id, conversationId: conversation.id } },
        running: conversation.running,
      }))
    : [],
);
const selectedFilePath = computed(() => {
  const path = route.query['path'];
  return route.name === 'file' && typeof path === 'string' ? path : undefined;
});
const files = computed(() => {
  const projectId = selected.value?.id;
  if (projectId === undefined || fileStore.state.projectId !== projectId) {
    return null;
  }
  return fileStore.state.rows?.map(row => fileItem(projectId, row)) ?? null;
});
const tabItems = computed(() => tabs.state.tabs.map(tabItem));

// The route's screen opens its tab.
watch(
  activeTab,
  tab => {
    if (tab) {
      tabs.open(tab);
    }
  },
  { immediate: true },
);

// A schedule the agent removed loses its tab, unless its screen shows: it says the schedule is gone until left.
watch([() => scheduleStore.state.schedules, activeKey], ([, key]) => tabs.dropGoneSchedules(key), { immediate: true });

watch(
  () => selected.value?.id,
  projectId => {
    if (projectId) {
      conversationStore.open(projectId);
      fileStore.open(projectId);
      store.markOpened(projectId);
    }
  },
  { immediate: true },
);

// App setup's onboarding, started after the home screen landed the person somewhere, opens while they are still there; never
// once they have moved on.
watch(
  () => [store.state.onboarding, shell.landing, route.fullPath] as const,
  ([onboarding, landing, path]) => {
    if (onboarding && landing === path) {
      store.takeOnboarding();
      void router.replace({ name: 'conversation', params: { ...onboarding } });
    }
  },
);

// An onboarding still pending when the person leaves the place they landed on is dropped: a later visit there never jumps
// into it.
watch(
  () => route.fullPath,
  (path, previous) => {
    if (store.state.onboarding && previous === shell.landing && path !== shell.landing) {
      store.takeOnboarding();
    }
  },
);

// The app's one connection to the daemon's events, for as long as the app runs; this shell shows only past the first
// run, when the daemon's sandbox is ready.
events.start();

// A failure is kept by the store and shown in place of the route's screen.
store.getProjects().catch(() => undefined);
// For the sidebar's count; the events keep it current.
void scheduleStore.load();

function fileItem(projectId: string, { entry, depth, expanded }: ProjectFileRow): ProjectSidebarFile {
  return entry.kind === 'folder'
    ? { path: entry.path, label: entry.name, kind: 'folder', depth, expanded }
    : {
        path: entry.path,
        label: fileTitle(entry.path),
        kind: fileKind(entry.path),
        depth,
        to: { name: 'file', params: { projectId }, query: { path: entry.path } },
        writing: fileAgents.get(projectId, entry.path)?.state === 'writing',
        waiting: fileAgents.get(projectId, entry.path)?.state === 'waiting',
      };
}

function tabItem(tab: Tab): TabBarItem {
  const base = { id: tabs.keyOf(tab), to: tabs.routeOf(tab) };
  switch (tab.kind) {
    case 'memory':
      return { ...base, title: t(l.memory), icon: 'memory', color: 'violet' };
    case 'schedules':
      return { ...base, title: t(l.schedules), icon: 'schedule' };
    case 'schedule': {
      const live = scheduleStore.state.schedules?.find(
        schedule => schedule.projectId === tab.projectId && schedule.id === tab.scheduleId,
      );
      return {
        ...base,
        title: live?.name ?? tab.title ?? t(l.schedules),
        icon: 'schedule',
        color: colorOf(tab.projectId),
      };
    }
    case 'newConversation':
      return { ...base, title: t(lc.newConversation), icon: 'conversation', color: colorOf(tab.projectId) };
    case 'conversation': {
      const live =
        conversationStore.state.projectId === tab.projectId ? conversationStore.find(tab.conversationId) : undefined;
      return {
        ...base,
        title: (live ? live.title : tab.title) ?? t(lc.untitled),
        icon: 'conversation',
        color: colorOf(tab.projectId),
        running: live?.running ?? false,
      };
    }
    case 'file':
      return { ...base, title: fileTitle(tab.path), icon: fileKind(tab.path) };
    default:
      return assertNever(tab);
  }
}

/** Closes a tab; closing the active one shows the tab beside it, or home when it was the last. */
function closeTab(key: string) {
  const closed = tabs.state.tabs.find(tab => tabs.keyOf(tab) === key);
  if (closed?.kind === 'file') {
    // A closed file holds the agent no longer: the person is done typing there.
    void fileAgents.release(closed.projectId, closed.path);
  }
  const next = tabs.close(key);
  if (key === activeKey.value) {
    void router.push(next ? tabs.routeOf(next) : { name: 'home' });
  }
}

function colorOf(projectId: string): ProjectColor {
  const project = store.state.projects?.find(candidate => candidate.id === projectId);
  return project?.role === 'appSetup' ? 'slate' : projectColor(projectId);
}
</script>

<template>
  <AppShell>
    <template #sidebar>
      <ProjectSidebar
        :memory-to="{ name: 'memory' }"
        :memory-selected="memoryOpen"
        :schedules-to="{ name: 'schedules' }"
        :schedules-selected="schedulesOpen"
        :schedules-count="scheduleStore.state.schedules?.length"
        :projects="items"
        :selected-id="selected?.id"
        :conversations="conversations"
        :selected-conversation-id="selectedConversationId"
        :files="files"
        :selected-file-path="selectedFilePath"
        @toggle-folder="fileStore.toggle"
        @create="shell.newProjectOpen = true"
      />
    </template>
    <template
      v-if="tabItems.length"
      #header
    >
      <TabBar
        :tabs="tabItems"
        :active-id="activeKey"
        @close="closeTab"
      />
    </template>
    <ProjectsLoadFailed v-if="store.state.projects === null && store.state.loadError !== null" />
    <NuxtPage v-else />
  </AppShell>
  <NewProjectDialog v-model:open="shell.newProjectOpen" />
</template>
