<!-- A project's every conversation (screen 11): its name, what the list holds and New conversation; filter chips (all, started by the person, one per schedule, with counts); the conversations of this week and the earlier ones as `HistoryRow`s, newest first; a spinner while they load and a line when a filter leaves none. -->

<script lang="ts">
import type { PropType } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

import type { HistoryRowStatus } from './HistoryRow.vue';

/** A filter over the list, as a chip; it lives in the address. */
export interface ProjectHistoryLayoutFilter {
  id: string;
  label: string;
  /** How many conversations it leaves. */
  count?: number;
  /** It keeps what one schedule started: the schedule's calendar on the chip. */
  schedule?: boolean;
  /** The list filtered by it. */
  to: RouteLocationRaw;
  /** The filter in force. */
  on: boolean;
}

/** Which part of the list a conversation is in. */
export type ProjectHistoryLayoutSection = 'thisWeek' | 'earlier';

/** A conversation, or a schedule's term without one, as the list shows it (`HistoryRow`). */
export interface ProjectHistoryLayoutRow {
  id: string;
  section: ProjectHistoryLayoutSection;
  /** The day, as a person says it ("Today", "Mon 10 Nov"). */
  day: string;
  /** The time under the day, or a dash for a term that never started. */
  time: string;
  status: HistoryRowStatus;
  title: string;
  /** The title is the status itself ("Skipped", "Couldn't start"). */
  statusInTitle?: boolean;
  /** How it went ("You · 14 messages", "Due 7:00 · started 9:13"). */
  detail: string;
  /** The schedule that started it; none for the person's own conversation. */
  scheduleName?: string;
  /** Its conversation; a term without one is a plain row. */
  to?: RouteLocationRaw;
}

export const ProjectHistoryLayoutProps = {
  projectName: { type: String, required: true },
  /** The project's screen, where a new conversation starts. */
  newConversationTo: { type: [String, Object] as PropType<RouteLocationRaw>, required: true },
  /** In the order they are shown: All, Started by you, then one per schedule. */
  filters: { type: Array as PropType<readonly ProjectHistoryLayoutFilter[]>, default: () => [] },
  /** Newest first, the filter in force applied. */
  rows: { type: Array as PropType<readonly ProjectHistoryLayoutRow[]>, default: () => [] },
  /** The conversations are being read: a spinner in the list's place. */
  loading: Boolean,
} as const;
</script>

<script lang="ts" setup>
import { Plus } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { computed, useId } from 'vue';

import Button from './Button.vue';
import FilterChip from './FilterChip.vue';
import HistoryRow from './HistoryRow.vue';
import * as l from './ProjectHistoryLayout.loc.js';
import Spinner from './Spinner.vue';

const props = defineProps(ProjectHistoryLayoutProps);

const SECTIONS: readonly ProjectHistoryLayoutSection[] = ['thisWeek', 'earlier'];

const t = useTranslate();
const sectionId = useId();
const sections = computed(() =>
  SECTIONS.map(section => ({ section, rows: props.rows.filter(row => row.section === section) })).filter(
    group => group.rows.length > 0,
  ),
);
</script>

<template>
  <div :class="$style.projectHistoryLayout">
    <header :class="$style.projectHistoryLayout_header">
      <div :class="$style.projectHistoryLayout_intro">
        <h1 :class="$style.projectHistoryLayout_title">{{ props.projectName }}</h1>
        <p :class="$style.projectHistoryLayout_lede">{{ t(l.lede) }}</p>
      </div>
      <Button
        :icon="Plus"
        :link="props.newConversationTo"
      >
        {{ t(l.newConversation) }}
      </Button>
    </header>
    <nav
      v-if="props.filters.length"
      :aria-label="t(l.filters)"
    >
      <ul :class="$style.projectHistoryLayout_filters">
        <li
          v-for="filter in props.filters"
          :key="filter.id"
        >
          <FilterChip
            :label="filter.label"
            :count="filter.count"
            :schedule="filter.schedule"
            :link="filter.to"
            :on="filter.on"
          />
        </li>
      </ul>
    </nav>
    <Spinner
      v-if="props.loading"
      :class="$style.projectHistoryLayout_spinner"
      :label="t(l.loading)"
    />
    <template v-else-if="sections.length">
      <section
        v-for="group in sections"
        :key="group.section"
        :class="$style.projectHistoryLayout_section"
        :aria-labelledby="`${sectionId}-${group.section}`"
      >
        <h2
          :id="`${sectionId}-${group.section}`"
          :class="$style.projectHistoryLayout_sectionTitle"
        >
          {{ t(l[group.section]) }}
        </h2>
        <div :class="$style.projectHistoryLayout_list">
          <HistoryRow
            v-for="row in group.rows"
            :key="row.id"
            :day="row.day"
            :time="row.time"
            :status="row.status"
            :title="row.title"
            :status-in-title="row.statusInTitle"
            :detail="row.detail"
            :schedule-name="row.scheduleName"
            :to="row.to"
          />
        </div>
      </section>
    </template>
    <p
      v-else
      :class="$style.projectHistoryLayout_empty"
    >
      {{ t(l.empty) }}
    </p>
  </div>
</template>

<style lang="scss" module>
.projectHistoryLayout {
  // The containing block of what it scrolls: absolutely positioned content would otherwise lengthen the window.
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: $spacing-16;
  min-height: 0;
  padding: $spacing-28 + $spacing-04 $spacing-48 $spacing-24;
  overflow-y: auto;
  color: $color-ink;
  line-height: $line-height-snug;
}

.projectHistoryLayout_header {
  display: flex;
  gap: $spacing-16;
  align-items: center;
}

.projectHistoryLayout_intro {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: $spacing-06;
  min-width: 0;
}

.projectHistoryLayout_title {
  margin: 0;
  @include font-heading;
  font-size: $font-size-title-s;
  font-weight: $font-weight-bold;
  line-height: $line-height-tight;
  overflow-wrap: anywhere;
}

.projectHistoryLayout_lede {
  margin: 0;
  color: $color-ink-body;
  font-size: $font-size-label;
  line-height: $line-height-normal;
  text-wrap: pretty;
}

.projectHistoryLayout_filters {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-08;
  margin: 0;
  padding: 0;
  list-style: none;
}

.projectHistoryLayout_section {
  display: flex;
  flex-direction: column;
  gap: $spacing-08;
}

// `ink-muted`, not the design's `ink-faint`: this is text, and `ink-faint` is under 4.5:1.
.projectHistoryLayout_sectionTitle {
  margin: 0;
  color: $color-ink-muted;
  font-size: $font-size-micro;
  font-weight: $font-weight-semibold;
  letter-spacing: $letter-spacing-list-head;
  text-transform: uppercase;
}

.projectHistoryLayout_list {
  overflow: hidden;
  border: 1px solid $color-border;
  border-radius: $radius-l;
}

.projectHistoryLayout_spinner {
  align-self: center;
  margin-top: $spacing-48;
  font-size: $font-size-heading;
}

.projectHistoryLayout_empty {
  margin: 0;
  padding: $spacing-18 $spacing-16;
  border: 1px solid $color-border;
  border-radius: $radius-l;
  color: $color-ink-muted;
  font-size: $font-size-body-s;
}
</style>
