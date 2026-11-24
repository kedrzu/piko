<!-- A schedule in the schedules table (screen 09), an ARIA row under `ScheduleRowHeader`: its calendar tile, its name (a link to the schedule, the whole row clickable), its project's folder in the project's colour, when it runs, its last run with the next one under it, and the switch that pauses it. A paused schedule is greyed, with "Paused" in place of the next run. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import type { PropType } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

import type { ProjectColor } from './ProjectColor.js';

/**
 * What became of the schedule's last run (`RunStatus`, a conversation aside); `notRun` before its first, `started` when
 * whether it still runs is not known.
 */
export type ScheduleRowLastRun = 'running' | 'started' | 'finished' | 'late' | 'skipped' | 'failed' | 'notRun';

export const ScheduleRowProps = {
  name: { type: String, required: true },
  /** The schedule's screen. */
  to: { type: [String, Object] as PropType<RouteLocationRaw>, required: true },
  projectName: { type: String, required: true },
  projectColor: { type: String as PropType<ProjectColor>, required: true },
  /** When it runs, as a person says it ("Every day at 8:00"). */
  when: { type: String, required: true },
  lastRun: { type: String as PropType<ScheduleRowLastRun>, required: true },
  /** When the last run was due ("today 8:00"), after its status; none before the first run. */
  lastRunAt: defineProp<string>(),
  /** When it runs next ("tomorrow 8:00"); without it, "No more runs". */
  nextAt: defineProp<string>(),
  /** Off: greyed, "Paused" in place of the next run, the switch off. */
  paused: Boolean,
} as const;

export const ScheduleRowEmits = {
  /** The person flipped the switch: `true` to pause. The row shows it once the parent passes `paused` back. */
  'update:paused': (_paused: boolean) => true,
};
</script>

<script lang="ts" setup>
import { Folder } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import RunStatusIcon from './RunStatusIcon.vue';
import * as l from './ScheduleRow.loc.js';
import ScheduleTile from './ScheduleTile.vue';
import Switch from './Switch.vue';

const props = defineProps(ScheduleRowProps);
const emit = defineEmits(ScheduleRowEmits);

const t = useTranslate();

const status = computed(() => {
  const label = t(l[props.lastRun]);
  return props.lastRunAt == null ? label : t(l.statusAt, { status: label, at: props.lastRunAt });
});
const next = computed(() => {
  if (props.paused) {
    return t(l.paused);
  }

  return props.nextAt == null ? t(l.noMoreRuns) : t(l.next, { at: props.nextAt });
});
</script>

<template>
  <div
    role="row"
    :class="[
      $style.scheduleRow,
      $style[`scheduleRow_${props.projectColor}`],
      props.paused && $style.scheduleRow_paused,
    ]"
  >
    <ScheduleTile :class="$style.scheduleRow_dim" />
    <span
      role="cell"
      :class="$style.scheduleRow_name"
    >
      <RouterLink
        :to="props.to"
        :class="$style.scheduleRow_link"
        >{{ props.name }}</RouterLink
      >
    </span>
    <span
      role="cell"
      :class="$style.scheduleRow_project"
    >
      <Folder
        :class="[$style.scheduleRow_folder, $style.scheduleRow_dim]"
        aria-hidden="true"
      />
      <span :class="$style.scheduleRow_text">{{ props.projectName }}</span>
    </span>
    <span
      role="cell"
      :class="$style.scheduleRow_when"
      >{{ props.when }}</span
    >
    <span
      role="cell"
      :class="$style.scheduleRow_lastRun"
    >
      <span :class="[$style.scheduleRow_status, props.lastRun === 'failed' && $style.scheduleRow_status_failed]">
        <RunStatusIcon
          :status="props.lastRun"
          :class="[$style.scheduleRow_statusIcon, $style.scheduleRow_dim]"
        />
        <span :class="$style.scheduleRow_text">{{ status }}</span>
      </span>
      <span :class="$style.scheduleRow_next">{{ next }}</span>
    </span>
    <span
      role="cell"
      :class="$style.scheduleRow_switch"
    >
      <Switch
        :model-value="!props.paused"
        :label="props.name"
        @update:model-value="emit('update:paused', !$event)"
      />
    </span>
  </div>
</template>

<style lang="scss" module>
@include project-color-modifiers(scheduleRow);

// The name's link stretches over the whole row (its `::after`); the switch sits above it.
.scheduleRow {
  @include schedule-table-columns;

  position: relative;
  padding-block: $spacing-14;
  border-bottom: 1px solid $color-border;
  color: $color-ink-body;
  font-size: $font-size-control;
  line-height: $line-height-snug;
  transition: background-color $duration-fast;

  &:last-child {
    border-bottom: 0;
  }

  @include hover {
    background: $color-surface-soft;
  }

  // The focus ring goes round the row the link stands for.
  &:has(.scheduleRow_link:focus-visible) {
    outline: 2px solid $color-focus;
    outline-offset: -2px;
  }
}

.scheduleRow_name {
  min-width: 0;
}

.scheduleRow_link {
  display: block;
  overflow: hidden;
  color: $color-ink;
  font-size: $font-size-body;
  font-weight: $font-weight-semibold;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;

  // The row's own ring (above) replaces the link's.
  &:focus-visible {
    outline: none;
  }

  &::after {
    position: absolute;
    inset: 0;
    content: '';
  }
}

.scheduleRow_project,
.scheduleRow_status {
  display: flex;
  gap: $spacing-06;
  align-items: center;
  min-width: 0;
}

.scheduleRow_project {
  gap: $spacing-08;
}

.scheduleRow_folder {
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--project-color);
}

.scheduleRow_text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scheduleRow_lastRun {
  display: flex;
  flex-direction: column;
  gap: $spacing-02;
  min-width: 0;
}

.scheduleRow_statusIcon {
  font-size: $font-size-body-s; // 14px, the design's icon
}

.scheduleRow_status_failed {
  color: $color-attention-ink;
}

// `ink-muted`, not the design's `ink-faint`: this is text, and `ink-faint` is under 4.5:1.
.scheduleRow_next {
  color: $color-ink-muted;
  font-size: $font-size-badge;
}

.scheduleRow_switch {
  position: relative;
  z-index: 1;
  display: flex;
}

// Paused: the icons fade as the design draws them; the text turns muted instead, since faded text would fall under
// 4.5:1.
.scheduleRow_paused {
  color: $color-ink-muted;

  .scheduleRow_link,
  .scheduleRow_status_failed {
    color: $color-ink-muted;
  }

  .scheduleRow_dim {
    opacity: 0.5;
  }

  .scheduleRow_next {
    color: $color-ink-body;
    font-weight: $font-weight-semibold;
  }
}
</style>
