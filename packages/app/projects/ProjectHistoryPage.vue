<!-- A project's every conversation (screen 11): the person's, its schedules' runs and the terms that started none, newest first in This week (the last seven days) and Earlier, filtered by the address's `?schedule=` (`mine` for the person's) with a count on each filter; an unknown project goes home. -->

<script lang="ts" setup>
import { useLanguage } from '@nzyme/vue-i18n/useLanguage.js';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { useRoute, useRouter } from 'nuxt/app';
import { computed, onScopeDispose, ref, watch } from 'vue';

import ProjectHistoryLayout from '@piko/ui/ProjectHistoryLayout.vue';
import type { ProjectHistoryLayoutFilter } from '@piko/ui/ProjectHistoryLayout.vue';

import { ConversationStore } from '@/conversations/ConversationStore.js';
import { ScheduleStore } from '@/schedules/ScheduleStore.js';

import { buildProjectHistory, HISTORY_MINE } from './buildProjectHistory.js';
import * as l from './ProjectHistoryPage.loc.js';
import { ProjectStore } from './ProjectStore.js';

/** How often "now" moves on, so "Today" turns into "Yesterday" without a reload. */
const CLOCK_TICK_MS = 60_000;

const projects = useService(ProjectStore);
const conversations = useService(ConversationStore);
const schedules = useService(ScheduleStore);
const route = useRoute();
const router = useRouter();
const language = useLanguage();
const t = useTranslate();

const now = ref(Date.now());
const projectId = computed(() => String(route.params['projectId']));
const project = computed(() => projects.state.projects?.find(candidate => candidate.id === projectId.value));
const filter = computed(() => {
  const value = route.query['schedule'];
  return typeof value === 'string' ? value : null;
});
/** The project's conversations; `null` while they load. The shell opens the route's project in the store. */
const listed = computed(() =>
  conversations.state.projectId === projectId.value ? conversations.state.conversations : null,
);
const projectSchedules = computed(() =>
  (schedules.state.schedules ?? []).filter(schedule => schedule.projectId === projectId.value),
);
const history = computed(() =>
  buildProjectHistory({
    projectId: projectId.value,
    conversations: listed.value ?? [],
    originOf: conversations.originOf,
    schedules: projectSchedules.value,
    runsOf: schedule => schedules.runsOf({ projectId: schedule.projectId, scheduleId: schedule.id }).runs,
    filter: filter.value,
    now: now.value,
    language: language.value,
  }),
);
const filters = computed((): ProjectHistoryLayoutFilter[] => [
  {
    id: 'all',
    label: t(l.all),
    count: history.value.all,
    to: filterRoute(null),
    on: filter.value === null,
  },
  {
    id: HISTORY_MINE,
    label: t(l.mine),
    count: history.value.mine,
    to: filterRoute(HISTORY_MINE),
    on: filter.value === HISTORY_MINE,
  },
  ...projectSchedules.value.map((schedule): ProjectHistoryLayoutFilter => ({
    id: `schedule:${schedule.id}`,
    label: schedule.name,
    count: history.value.bySchedule.get(schedule.id) ?? 0,
    schedule: true,
    to: filterRoute(schedule.id),
    on: filter.value === schedule.id,
  })),
]);

const clock = setInterval(() => (now.value = Date.now()), CLOCK_TICK_MS);
onScopeDispose(() => clearInterval(clock));

watch(
  () => [projects.state.projects, project.value] as const,
  ([list, open]) => {
    if (list && !open) {
      void router.replace({ name: 'home' });
    }
  },
  { immediate: true },
);

void schedules.load();

function filterRoute(value: string | null) {
  return {
    name: 'history',
    params: { projectId: projectId.value },
    query: value === null ? {} : { schedule: value },
  };
}
</script>

<template>
  <ProjectHistoryLayout
    :project-name="project?.name ?? ''"
    :new-conversation-to="{ name: 'project', params: { projectId } }"
    :filters="filters"
    :rows="history.rows"
    :loading="listed === null"
  />
</template>
