<!-- A conversation or a schedule's term in a history list (screens 10 and 11): its day and time, an icon for what became of it (running, finished, late, skipped, couldn't start, or a conversation the person started), its title and a line under it, the schedule that started it as a chip, and a chevron. A link to its conversation; a term without one (skipped, or failed before it started) is a plain row. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import type { PropType } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

import type { RunStatus } from './RunStatusIcon.vue';

/** What the row stands for: a run of a schedule (`RunStatus`) or `person`, a conversation the person started. */
export type HistoryRowStatus = Exclude<RunStatus, 'notRun'>;

export const HistoryRowProps = {
  /** The day, as a person says it ("Today", "Fri 20 Nov"). */
  day: { type: String, required: true },
  /** The time under the day ("8:00"), or a dash for a term that never started. */
  time: { type: String, required: true },
  status: { type: String as PropType<HistoryRowStatus>, required: true },
  /** The conversation's title, or what became of the term ("Skipped"). */
  title: { type: String, required: true },
  /** The title is the status itself ("Skipped", "Couldn't start"): no hidden status label before it to say it twice. */
  statusInTitle: Boolean,
  /** The line under the title: how it went or why ("Finished at 8:01", "Due 8:00 · started 9:14"). */
  detail: { type: String, required: true },
  /** The schedule that started it, as a chip; none on a schedule's own screen or for the person's conversation. */
  scheduleName: defineProp<string>(),
  /** Its conversation; without one the row is not a link and has no chevron. */
  to: defineProp<RouteLocationRaw>(),
} as const;
</script>

<script lang="ts" setup>
import { CalendarClock, ChevronRight } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { RouterLink } from 'vue-router';

import * as l from './HistoryRow.loc.js';
import RunStatusIcon from './RunStatusIcon.vue';

const props = defineProps(HistoryRowProps);

const t = useTranslate();
</script>

<template>
  <component
    :is="props.to ? RouterLink : 'div'"
    :to="props.to"
    :class="[$style.historyRow, props.to && $style.historyRow_link]"
  >
    <span :class="$style.historyRow_when">
      <span :class="$style.historyRow_day">{{ props.day }}</span>
      <span :class="$style.historyRow_time">{{ props.time }}</span>
    </span>
    <RunStatusIcon
      :status="props.status"
      :class="$style.historyRow_icon"
    />
    <span :class="$style.historyRow_text">
      <span :class="$style.historyRow_title">
        <span
          v-if="!props.statusInTitle"
          :class="$style.historyRow_hidden"
          >{{ t(l[props.status]) }}: </span
        >{{ props.title }}
      </span>
      <span :class="$style.historyRow_detail">{{ props.detail }}</span>
    </span>
    <span
      v-if="props.scheduleName != null"
      :class="$style.historyRow_schedule"
    >
      <CalendarClock
        :class="$style.historyRow_scheduleIcon"
        aria-hidden="true"
      />
      <span :class="$style.historyRow_hidden">{{ t(l.schedule) }}: </span>{{ props.scheduleName }}
    </span>
    <!-- Without a link the chevron's place stays empty, so the chips line up. -->
    <ChevronRight
      :class="[$style.historyRow_chevron, !props.to && $style.historyRow_chevron_none]"
      aria-hidden="true"
    />
  </component>
</template>

<style lang="scss" module>
.historyRow {
  display: flex;
  gap: $spacing-14;
  align-items: center;
  padding: $spacing-12 $spacing-16;
  border-top: 1px solid $color-border;
  background: $color-surface;
  color: $color-ink;
  line-height: $line-height-snug;
  text-decoration: none;

  &:first-child {
    border-top: 0;
  }
}

.historyRow_link {
  transition: background-color $duration-fast;

  @include hover {
    background: $color-surface-soft;
  }

  // Inside the ring, which the list's rounded border would otherwise clip.
  &:focus-visible {
    outline: 2px solid $color-focus;
    outline-offset: -2px;
  }
}

.historyRow_when {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: $spacing-02;
  width: 96px;
}

.historyRow_day {
  font-size: $font-size-control;
  font-weight: $font-weight-semibold;
}

// `ink-muted`, not the design's `ink-faint`: the time is text, and `ink-faint` is under 4.5:1.
.historyRow_time {
  color: $color-ink-muted;
  font-size: $font-size-badge;
}

.historyRow_icon {
  font-size: $font-size-lead; // 17px, the design's icon
}

.historyRow_text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: $spacing-02;
  min-width: 0;
}

.historyRow_title,
.historyRow_detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.historyRow_title {
  font-size: $font-size-body-s;
  font-weight: $font-weight-semibold;
}

.historyRow_detail {
  color: $color-ink-muted;
  font-size: $font-size-caption;
}

.historyRow_schedule {
  display: inline-flex;
  flex: none;
  gap: $spacing-04;
  align-items: center;
  max-width: 40%;
  padding: $spacing-badge-y $spacing-08;
  overflow: hidden;
  border-radius: $radius-pill;
  background: $color-link-soft;
  color: $color-link-ink;
  font-size: $font-size-micro;
  font-weight: $font-weight-semibold;
  white-space: nowrap;
}

.historyRow_scheduleIcon {
  flex: none;
  width: 11px;
  height: 11px;
}

.historyRow_chevron {
  flex: none;
  width: 16px;
  height: 16px;
  color: $color-ink-faint;
}

.historyRow_chevron_none {
  visibility: hidden;
}

.historyRow_hidden {
  @include visually-hidden;
}
</style>
