<!-- A schedule's screen: its runs, newest first, each opening its conversation; how it runs, edited in place (only what the person changed is saved); the switch that pauses it and Delete. Says the schedule is gone once the agent removed it. -->

<script lang="ts" setup>
import { RefreshCw } from '@lucide/vue';
import { HttpError } from '@nzyme/fetch-utils/HttpError.js';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { useLanguage } from '@nzyme/vue-i18n/useLanguage.js';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { useLogger } from '@nzyme/vue-ioc/useLogger.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { useRoute, useRouter } from 'nuxt/app';
import { computed, onScopeDispose, ref, watch } from 'vue';

import type { Schedule, ScheduleRef, ScheduleRun } from '@piko/common/api/ScheduleTypes.js';
import Button from '@piko/ui/Button.vue';
import ErrorDetails from '@piko/ui/ErrorDetails.vue';
import ScheduleLayout from '@piko/ui/ScheduleLayout.vue';
import type { ScheduleLayoutRun } from '@piko/ui/ScheduleLayout.vue';
import type { ScheduleSettingsValue } from '@piko/ui/ScheduleSettings.vue';

import * as lc from '@/conversations/Conversations.loc.js';
import { ConversationStore } from '@/conversations/ConversationStore.js';
import { projectColor } from '@/projects/projectColor.js';
import { ProjectStore } from '@/projects/ProjectStore.js';
import { TabStore } from '@/tabs/TabStore.js';

import { buildScheduleUpdate } from './buildScheduleUpdate.js';
import { formatScheduleMoment } from './formatScheduleMoment.js';
import { isLateRun } from './isLateRun.js';
import { parseSchedulePreset } from './schedulePreset.js';
import * as l from './SchedulePage.loc.js';
import { ScheduleStore } from './ScheduleStore.js';
import { useSchedulePausing } from './useSchedulePausing.js';

/** How often "now" moves on, so "Today" turns into "Yesterday" without a reload. */
const CLOCK_TICK_MS = 60_000;
/** The time of a term that never started. */
const NO_TIME = '—';

const store = useService(ScheduleStore);
const conversations = useService(ConversationStore);
const projects = useService(ProjectStore);
const tabs = useService(TabStore);
const pausing = useSchedulePausing();
const route = useRoute();
const router = useRouter();
const language = useLanguage();
const t = useTranslate();
const logger = useLogger();

const now = ref(Date.now());
const scheduleRef = computed((): ScheduleRef => ({
  projectId: String(route.params['projectId']),
  scheduleId: String(route.params['scheduleId']),
}));
const schedule = computed(() =>
  store.state.schedules?.find(
    candidate => candidate.projectId === scheduleRef.value.projectId && candidate.id === scheduleRef.value.scheduleId,
  ),
);
/** The schedule as last listed, so the gone state still names it. */
const lastSeen = ref<Schedule>();
/** The daemon answered that the schedule is gone, before the list says so. */
const removed = ref(false);
const gone = computed(() => removed.value || (store.state.schedules !== null && schedule.value === undefined));
const name = computed(() => schedule.value?.name ?? lastSeen.value?.name ?? tabTitle() ?? '');
const projectName = computed(
  () =>
    schedule.value?.projectName ??
    lastSeen.value?.projectName ??
    projects.state.projects?.find(project => project.id === scheduleRef.value.projectId)?.name ??
    '',
);
const runs = computed(() => (schedule.value ? store.runsOf(scheduleRef.value) : null));
const runRows = computed(() => runs.value?.runs?.map(toRunRow) ?? []);
const editing = ref(false);
const saving = ref(false);
const saveError = ref<string>();
const deleteOpen = ref(false);
const deleteError = ref<string>();

const clock = setInterval(() => (now.value = Date.now()), CLOCK_TICK_MS);
onScopeDispose(() => clearInterval(clock));

watch(
  schedule,
  current => {
    if (current) {
      lastSeen.value = current;
    }
  },
  { immediate: true },
);

// Another schedule: nothing of the last one's screen carries over.
watch(
  () => JSON.stringify(scheduleRef.value),
  () => {
    lastSeen.value = schedule.value;
    removed.value = false;
    editing.value = false;
    saveError.value = undefined;
    deleteOpen.value = false;
    deleteError.value = undefined;
  },
);

// A dialog opened again starts without the last failure.
watch(deleteOpen, open => {
  if (!open) {
    deleteError.value = undefined;
  }
});

void store.load();

function edit() {
  editing.value = true;
  saveError.value = undefined;
}

function cancel() {
  editing.value = false;
  saveError.value = undefined;
}

async function save(value: ScheduleSettingsValue) {
  const current = schedule.value;
  if (!current) {
    return;
  }
  const input = buildScheduleUpdate({ schedule: current, edit: value, now: new Date(), language: language.value });
  saveError.value = undefined;
  if (input === null) {
    editing.value = false;
    return;
  }
  saving.value = true;
  try {
    await store.update(input);
    editing.value = false;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      removed.value = true;
    } else if (error instanceof HttpError && error.status === 400) {
      // `InvalidSchedule`: the daemon says what is wrong, and saved nothing.
      saveError.value = error.message;
    } else {
      logger.warn('Schedule could not be saved', { ...scheduleRef.value, error });
      saveError.value = t(l.saveFailed);
    }
  } finally {
    saving.value = false;
  }
}

async function setPaused(paused: boolean) {
  if ((await pausing.setPaused(scheduleRef.value, paused)) === 'gone') {
    removed.value = true;
  }
}

/** Deletes the schedule the person confirmed; its tab closes and Schedules shows. One already gone counts as deleted. */
async function remove() {
  const target = scheduleRef.value;
  try {
    await store.remove(target);
  } catch (error) {
    if (!(error instanceof HttpError && error.status === 404)) {
      logger.warn('Schedule could not be deleted', { ...target, error });
      deleteError.value = t(l.deleteFailed);
      return;
    }
  }
  deleteOpen.value = false;
  tabs.close(tabs.keyOf({ kind: 'schedule', ...target, title: null }));
  await router.push({ name: 'schedules' });
}

async function retryRuns() {
  await store.retryRuns(scheduleRef.value);
}

async function retry() {
  await store.load();
}

function toRunRow(run: ScheduleRun): ScheduleLayoutRun {
  const id = `${run.term}:${run.at}`;
  const due = moment(run.term);
  switch (run.outcome) {
    case 'started':
      return { id, ...startedRun(run) };
    case 'skipped':
      return {
        id,
        day: due.day,
        time: NO_TIME,
        status: 'skipped',
        title: t(l.skipped),
        statusInTitle: true,
        detail: t(l.skippedDetail),
      };
    case 'failed':
      return {
        id,
        day: due.day,
        time: NO_TIME,
        status: 'failed',
        title: t(l.failed),
        statusInTitle: true,
        detail: run.message ?? t(l.failedDetail),
        to: conversationRoute(run.conversationId),
      };
    default:
      return assertNever(run.outcome);
  }
}

/**
 * A started run with its conversation's title and state, when the conversation is at hand (the schedule's project is
 * the open one, so its conversations are listed). Without it, the schedule's name and only that it started.
 */
function startedRun(run: ScheduleRun): Omit<ScheduleLayoutRun, 'id'> {
  const ran = moment(run.at);
  const late = isLateRun(run);
  const conversation =
    run.conversationId !== undefined && conversations.state.projectId === scheduleRef.value.projectId
      ? conversations.find(run.conversationId)
      : undefined;
  const base = { day: ran.day, time: ran.time, to: conversationRoute(run.conversationId) };
  if (!conversation) {
    return {
      ...base,
      status: late ? 'late' : 'started',
      title: name.value,
      detail: late ? lateDetail(run) : t(l.startedAt, { time: ran.time }),
    };
  }
  const title = conversation.title ?? t(lc.untitled);
  if (conversation.running) {
    return { ...base, status: 'running', title, detail: t(l.stillRunning) };
  }
  if (late) {
    return { ...base, status: 'late', title, detail: lateDetail(run) };
  }
  return {
    ...base,
    status: 'finished',
    title,
    detail: t(l.finishedAt, { time: momentBeside(conversation.updatedAt, run.at) }),
  };
}

/** When a late run was due and when it started, with the likely reason. */
function lateDetail(run: ScheduleRun) {
  return t(l.late, { due: momentBeside(run.term, run.at), time: moment(run.at).time });
}

function conversationRoute(conversationId: string | undefined) {
  return conversationId === undefined
    ? undefined
    : { name: 'conversation', params: { projectId: scheduleRef.value.projectId, conversationId } };
}

function moment(at: number) {
  return formatScheduleMoment({ at, now: now.value, language: language.value });
}

/** A moment said beside another: its time alone on the same day, with its day otherwise. */
function momentBeside(at: number, other: number) {
  const said = moment(at);
  return said.day === moment(other).day ? said.time : said.dayAndTime;
}

/** The name the schedule's tab remembers, for a schedule gone before this run of the app listed it. */
function tabTitle() {
  const { projectId, scheduleId } = scheduleRef.value;
  for (const tab of tabs.state.tabs) {
    if (tab.kind === 'schedule' && tab.projectId === projectId && tab.scheduleId === scheduleId) {
      return tab.title ?? undefined;
    }
  }
  return undefined;
}
</script>

<template>
  <section
    v-if="store.state.schedules === null && store.state.loadError !== null"
    :class="$style.schedulePage_failed"
  >
    <h1 :class="$style.schedulePage_failedTitle">{{ t(l.loadFailedTitle) }}</h1>
    <p :class="$style.schedulePage_failedBody">{{ t(l.loadFailedBody) }}</p>
    <ErrorDetails :details="store.state.loadError">
      <template #actions>
        <Button
          :icon="RefreshCw"
          @click="retry"
        >
          {{ t(l.retry) }}
        </Button>
      </template>
    </ErrorDetails>
  </section>
  <ScheduleLayout
    v-else-if="store.state.schedules !== null"
    v-model:delete-open="deleteOpen"
    :name="name"
    :schedules-to="{ name: 'schedules' }"
    :project-name="projectName"
    :project-color="projectColor(scheduleRef.projectId)"
    :project-to="{ name: 'project', params: { projectId: scheduleRef.projectId } }"
    :paused="schedule ? pausing.pausedOf(schedule) : false"
    :runs-loading="runs !== null && runs.runs === null"
    :runs-error="runs?.error ?? undefined"
    :runs="runRows"
    :next-at="schedule?.nextRunAt != null ? moment(schedule.nextRunAt).dayAndTime : undefined"
    :prompt="schedule?.prompt ?? ''"
    :when="schedule?.when ?? ''"
    :preset="schedule ? (parseSchedulePreset(schedule) ?? undefined) : undefined"
    :editing="editing"
    :saving="saving"
    :save-error="saveError"
    :delete-error="deleteError"
    :gone="gone"
    @update:paused="setPaused"
    @edit="edit"
    @cancel="cancel"
    @save="save"
    @delete="remove"
    @retry-runs="retryRuns"
  />
</template>

<style lang="scss" module>
.schedulePage_failed {
  display: flex;
  flex-direction: column;
  gap: $spacing-16;
  max-width: 500px;
  margin: auto;
  padding: $spacing-24;
}

.schedulePage_failedTitle {
  margin: 0;
  color: $color-ink;
  @include font-heading;
  font-size: $font-size-title-s;
}

.schedulePage_failedBody {
  margin: 0;
  color: $color-ink-body;
}
</style>
