<!-- Over a conversation a schedule started: its calendar tile, "Started by" the schedule, when the run was due and when it started (with why it was late), and links to all its runs and to the schedule, on the link tint. Only the name when the run is no longer known. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import type { PropType } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

export const RunHeaderProps = {
  scheduleName: { type: String, required: true },
  /** When the run was due and when it started, with why it was late ("Due Tue 7:00 · ran 7:42, …"); none when the run is no longer known. */
  detail: defineProp<string>(),
  /** The schedule's runs. */
  runsLink: { type: [String, Object] as PropType<RouteLocationRaw>, required: true },
  /** The schedule's settings. */
  scheduleLink: { type: [String, Object] as PropType<RouteLocationRaw>, required: true },
} as const;
</script>

<script lang="ts" setup>
import { CalendarClock, History, Settings2 } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';

import Button from './Button.vue';
import * as l from './RunHeader.loc.js';

const props = defineProps(RunHeaderProps);

const t = useTranslate();
</script>

<template>
  <div :class="$style.runHeader">
    <span
      :class="$style.runHeader_tile"
      aria-hidden="true"
    >
      <CalendarClock :class="$style.runHeader_tileIcon" />
    </span>
    <span :class="$style.runHeader_text">
      <span :class="$style.runHeader_title">{{ t(l.startedBy, { name: props.scheduleName }) }}</span>
      <span
        v-if="props.detail != null"
        :class="$style.runHeader_detail"
        >{{ props.detail }}</span
      >
    </span>
    <span :class="$style.runHeader_actions">
      <Button
        variant="onTint"
        :icon="History"
        :link="props.runsLink"
        >{{ t(l.allRuns) }}</Button
      >
      <Button
        variant="onTint"
        :icon="Settings2"
        :link="props.scheduleLink"
        >{{ t(l.schedule) }}</Button
      >
    </span>
  </div>
</template>

<style lang="scss" module>
.runHeader {
  display: flex;
  gap: $spacing-14;
  align-items: center;
  padding: $spacing-12 $spacing-14 $spacing-12 $spacing-16;
  border-radius: $radius-m;
  background: $color-link-soft;
  line-height: $line-height-snug;
}

.runHeader_tile {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: $radius-s;
  background: $color-surface;
  color: $color-link-ink;
}

.runHeader_tileIcon {
  width: 15px;
  height: 15px;
}

.runHeader_text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: $spacing-02;
  min-width: 0;
}

.runHeader_title {
  color: $color-ink;
  font-size: $font-size-body-s;
  font-weight: $font-weight-semibold;
}

.runHeader_detail {
  color: $color-ink-body;
  font-size: $font-size-control;
}

.runHeader_actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: $spacing-06;
  align-items: center;
}
</style>
