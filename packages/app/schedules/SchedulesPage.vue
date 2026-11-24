<!-- The Schedules screen: every schedule of every project with when it runs, its last run and its next, and the switch that pauses it; follows the agent's changes live. -->

<script lang="ts" setup>
import { assertNever } from '@nzyme/utils/assertNever.js';
import { useLanguage } from '@nzyme/vue-i18n/useLanguage.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { computed, onScopeDispose, ref } from 'vue';

import type { Schedule, ScheduleRun } from '@piko/common/api/ScheduleTypes.js';
import type { ScheduleRowLastRun } from '@piko/ui/ScheduleRow.vue';
import SchedulesLayout from '@piko/ui/SchedulesLayout.vue';
import type { SchedulesLayoutSchedule } from '@piko/ui/SchedulesLayout.vue';

import { projectColor } from '@/projects/projectColor.js';

import { formatScheduleMoment } from './formatScheduleMoment.js';
import { isLateRun } from './isLateRun.js';
import { ScheduleStore } from './ScheduleStore.js';
import { useSchedulePausing } from './useSchedulePausing.js';

/** How often "now" moves on, so "today" turns into "yesterday" without a reload. */
const CLOCK_TICK_MS = 60_000;

const store = useService(ScheduleStore);
const pausing = useSchedulePausing();
const language = useLanguage();

const now = ref(Date.now());
const schedules = computed(() => (store.state.schedules ?? []).map(toRow));

const clock = setInterval(() => (now.value = Date.now()), CLOCK_TICK_MS);
onScopeDispose(() => clearInterval(clock));

void store.load();

function toRow(schedule: Schedule): SchedulesLayoutSchedule {
  const lastRun = schedule.lastRun;
  return {
    id: rowId(schedule),
    name: schedule.name,
    to: { name: 'schedule', params: { projectId: schedule.projectId, scheduleId: schedule.id } },
    projectName: schedule.projectName,
    projectColor: projectColor(schedule.projectId),
    when: schedule.when,
    lastRun: lastRun ? lastRunStatus(lastRun) : 'notRun',
    lastRunAt: lastRun ? moment(lastRun.term) : undefined,
    nextAt: schedule.nextRunAt != null ? moment(schedule.nextRunAt) : undefined,
    paused: pausing.pausedOf(schedule),
  };
}

/** A started run may be another project's, whose conversations are not at hand: it says it started, never finished. */
function lastRunStatus(run: ScheduleRun): ScheduleRowLastRun {
  switch (run.outcome) {
    case 'started':
      return isLateRun(run) ? 'late' : 'started';
    case 'skipped':
      return 'skipped';
    case 'failed':
      return 'failed';
    default:
      return assertNever(run.outcome);
  }
}

function moment(at: number) {
  return formatScheduleMoment({ at, now: now.value, language: language.value }).dayAndTime;
}

async function setPaused(id: string, paused: boolean) {
  const schedule = store.state.schedules?.find(candidate => rowId(candidate) === id);
  if (schedule) {
    await pausing.setPaused({ projectId: schedule.projectId, scheduleId: schedule.id }, paused);
  }
}

async function retry() {
  await store.load();
}

/** Unique across projects: two projects may hold a schedule of the same id. */
function rowId(schedule: Schedule) {
  return `${schedule.projectId}/${schedule.id}`;
}
</script>

<template>
  <SchedulesLayout
    :schedules="schedules"
    :loading="store.state.schedules === null && store.state.loadError === null"
    :load-error="store.state.schedules === null ? (store.state.loadError ?? undefined) : undefined"
    @set-paused="setPaused"
    @retry="retry"
  />
</template>
