<!-- The Schedules screen (screens 09 and 79): its title and what schedules are, then the table of every schedule (`ScheduleRow`s under `ScheduleRowHeader`) with notes on late and skipped runs, or how the agent creates one while there are none; a spinner while they load, and why they did not load with Try again. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import type { PropType } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

import type { ProjectColor } from './ProjectColor.js';
import type { ScheduleRowLastRun } from './ScheduleRow.vue';

/** A schedule as the table lists it (`ScheduleRow`). */
export interface SchedulesLayoutSchedule {
  id: string;
  name: string;
  /** The schedule's screen. */
  to: RouteLocationRaw;
  projectName: string;
  projectColor: ProjectColor;
  /** When it runs, as a person says it ("Every day at 8:00"). */
  when: string;
  lastRun: ScheduleRowLastRun;
  /** When the last run was due ("today 8:00"); none before the first run. */
  lastRunAt?: string;
  /** When it runs next; without it, "No more runs". */
  nextAt?: string;
  paused: boolean;
}

export const SchedulesLayoutProps = {
  /** In the order they are listed. */
  schedules: { type: Array as PropType<readonly SchedulesLayoutSchedule[]>, default: () => [] },
  /** The schedules are being read: a spinner in the table's place. */
  loading: Boolean,
  /** Why the schedules could not be read, the technical message behind "Show details"; shown with Try again. */
  loadError: defineProp<string>(),
} as const;

/** What the screen reports. */
export interface SchedulesLayoutEvents {
  /** The person flipped a schedule's switch: `true` to pause it. The row shows it once the parent passes it back. */
  setPaused: [id: string, paused: boolean];
  /** The person asked to read the schedules again; awaited, Try again is busy until it settles. */
  retry: [];
}
</script>

<script lang="ts" setup>
import { Moon, Pause, RefreshCw } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { useEmitAsync } from '@nzyme/vue-utils/useEmitAsync.js';

import Button from './Button.vue';
import ErrorDetails from './ErrorDetails.vue';
import ScheduleRow from './ScheduleRow.vue';
import ScheduleRowHeader from './ScheduleRowHeader.vue';
import * as l from './SchedulesLayout.loc.js';
import ScheduleTile from './ScheduleTile.vue';
import Spinner from './Spinner.vue';

const props = defineProps(SchedulesLayoutProps);
const emit = defineEmits<SchedulesLayoutEvents>();

const emitAsync = useEmitAsync<SchedulesLayoutEvents>();
const t = useTranslate();

function retry() {
  return emitAsync('retry');
}
</script>

<template>
  <div :class="$style.schedulesLayout">
    <header :class="$style.schedulesLayout_header">
      <h1 :class="$style.schedulesLayout_title">{{ t(l.title) }}</h1>
      <p :class="$style.schedulesLayout_lede">{{ t(l.lede) }}</p>
    </header>
    <div
      v-if="props.loadError != null"
      :class="$style.schedulesLayout_failed"
    >
      <h2 :class="$style.schedulesLayout_failedTitle">{{ t(l.failedTitle) }}</h2>
      <p :class="$style.schedulesLayout_failedBody">{{ t(l.failedBody) }}</p>
      <ErrorDetails :details="props.loadError">
        <template #actions>
          <Button
            :icon="RefreshCw"
            @click="retry"
          >
            {{ t(l.retry) }}
          </Button>
        </template>
      </ErrorDetails>
    </div>
    <Spinner
      v-else-if="props.loading"
      :class="$style.schedulesLayout_spinner"
      :label="t(l.loading)"
    />
    <template v-else-if="props.schedules.length">
      <div
        role="table"
        :aria-label="t(l.table)"
        :class="$style.schedulesLayout_table"
      >
        <ScheduleRowHeader />
        <ScheduleRow
          v-for="schedule in props.schedules"
          :key="schedule.id"
          :name="schedule.name"
          :to="schedule.to"
          :project-name="schedule.projectName"
          :project-color="schedule.projectColor"
          :when="schedule.when"
          :last-run="schedule.lastRun"
          :last-run-at="schedule.lastRunAt"
          :next-at="schedule.nextAt"
          :paused="schedule.paused"
          @update:paused="emit('setPaused', schedule.id, $event)"
        />
      </div>
      <ul :class="$style.schedulesLayout_notes">
        <li :class="$style.schedulesLayout_note">
          <Moon
            :class="$style.schedulesLayout_noteIcon"
            aria-hidden="true"
          />
          {{ t(l.lateNote) }}
        </li>
        <li :class="$style.schedulesLayout_note">
          <Pause
            :class="$style.schedulesLayout_noteIcon"
            aria-hidden="true"
          />
          {{ t(l.skippedNote) }}
        </li>
      </ul>
    </template>
    <div
      v-else
      :class="$style.schedulesLayout_empty"
    >
      <ScheduleTile large />
      <h2 :class="$style.schedulesLayout_emptyTitle">{{ t(l.emptyTitle) }}</h2>
      <p :class="$style.schedulesLayout_emptyBody">{{ t(l.emptyBody) }}</p>
    </div>
  </div>
</template>

<style lang="scss" module>
.schedulesLayout {
  // The containing block of what it scrolls: absolutely positioned content would otherwise lengthen the window.
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: $spacing-22;
  min-height: 0;
  padding: $spacing-28 + $spacing-08 $spacing-48 $spacing-24;
  overflow-y: auto;
  color: $color-ink;
  line-height: $line-height-snug;
}

.schedulesLayout_header {
  display: flex;
  flex-direction: column;
  gap: $spacing-06;
}

.schedulesLayout_title {
  margin: 0;
  @include font-heading;
  font-size: $font-size-title-s;
  font-weight: $font-weight-bold;
  line-height: $line-height-tight;
}

.schedulesLayout_lede {
  margin: 0;
  color: $color-ink-body;
  font-size: $font-size-label;
  line-height: $line-height-normal;
  text-wrap: pretty;
}

.schedulesLayout_table {
  overflow: hidden;
  border: 1px solid $color-border;
  border-radius: $radius-l;
  background: $color-surface;
}

.schedulesLayout_notes {
  display: flex;
  flex-direction: column;
  gap: $spacing-08;
  margin: 0;
  padding: $spacing-06 $spacing-04;
  list-style: none;
}

.schedulesLayout_note {
  display: flex;
  gap: $spacing-08;
  color: $color-ink-muted;
  font-size: $font-size-caption;
  line-height: $line-height-normal;
}

.schedulesLayout_noteIcon {
  flex: none;
  width: 14px;
  height: 14px;
  margin-top: $spacing-02;
  color: $color-ink-faint;
}

.schedulesLayout_spinner {
  align-self: center;
  margin-top: $spacing-48;
  font-size: $font-size-heading;
}

.schedulesLayout_failed {
  display: flex;
  flex-direction: column;
  gap: $spacing-12;
  max-width: 560px;
}

.schedulesLayout_failedTitle {
  margin: 0;
  @include font-heading;
  font-size: $font-size-heading;
  font-weight: $font-weight-bold;
  line-height: $line-height-tight;
}

.schedulesLayout_failedBody {
  margin: 0;
  color: $color-ink-body;
  font-size: $font-size-body-l;
  line-height: $line-height-relaxed;
}

.schedulesLayout_empty {
  display: flex;
  flex-direction: column;
  gap: $spacing-14;
  align-items: center;
  padding-top: $spacing-120 - $spacing-24;
  text-align: center;
}

.schedulesLayout_emptyTitle {
  margin: 0;
  @include font-heading;
  font-size: $font-size-heading;
  font-weight: $font-weight-bold;
  line-height: $line-height-tight;
}

.schedulesLayout_emptyBody {
  max-width: 440px;
  margin: 0;
  color: $color-ink-body;
  font-size: $font-size-body;
  line-height: $line-height-relaxed;
  text-wrap: pretty;
}
</style>
