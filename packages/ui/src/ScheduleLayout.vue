<!-- A schedule's screen (screens 10, 75–78, 80): the way back to Schedules, its tile, name and project, the switch that pauses it and Delete (confirmed in a dialog); its runs, newest first, beside how it runs (`ScheduleSettings`). Once the schedule is gone, only that it is gone and the way back. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import type { PropType } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

import type { HistoryRowStatus } from './HistoryRow.vue';
import type { ProjectColor } from './ProjectColor.js';
import type { ScheduleSettingsPreset, ScheduleSettingsValue } from './ScheduleSettings.vue';

/** A run of the schedule as its list shows it (`HistoryRow`). */
export interface ScheduleLayoutRun {
  id: string;
  /** The day, as a person says it ("Today", "Fri 20 Nov"). */
  day: string;
  /** The time under the day, or a dash for a term that never started. */
  time: string;
  status: HistoryRowStatus;
  /** The conversation's title, or what became of the term ("Skipped"). */
  title: string;
  /** The title is the status itself ("Skipped", "Couldn't start"). */
  statusInTitle?: boolean;
  /** How it went or why ("Finished at 8:01", "Due 8:00 · started 9:14"). */
  detail: string;
  /** Its conversation; a term without one is a plain row. */
  to?: RouteLocationRaw;
}

export const ScheduleLayoutProps = {
  name: { type: String, required: true },
  /** The Schedules screen, the breadcrumb's way back. */
  schedulesTo: { type: [String, Object] as PropType<RouteLocationRaw>, required: true },
  projectName: { type: String, required: true },
  projectColor: { type: String as PropType<ProjectColor>, required: true },
  /** The project's screen. */
  projectTo: { type: [String, Object] as PropType<RouteLocationRaw>, required: true },
  /** Off: the switch off and "Off" beside it. */
  paused: Boolean,
  /** The runs are being read: a spinner in the list's place, never "No runs yet". */
  runsLoading: Boolean,
  /** Newest first. */
  runs: { type: Array as PropType<readonly ScheduleLayoutRun[]>, default: () => [] },
  /** When it runs next ("tomorrow 8:00"), said while it has no runs yet. */
  nextAt: defineProp<string>(),
  /** What the agent does, for `ScheduleSettings`. */
  prompt: { type: String, required: true },
  /** When it runs, as a person says it. */
  when: { type: String, required: true },
  /** The recurrence the form edits; without one the rule is read-only. */
  preset: defineProp<ScheduleSettingsPreset>(),
  /** How it runs shows as a form (`ScheduleSettings`'s `editing`). */
  editing: Boolean,
  /** A save is in flight. */
  saving: Boolean,
  /** Why the last save failed. */
  saveError: defineProp<string>(),
  /** The schedule was removed (by the agent) while the screen was open: only that, and the way back. */
  gone: Boolean,
} as const;

/** What the screen reports. */
export interface ScheduleLayoutEvents {
  /** The person flipped the switch: `true` to pause. */
  'update:paused': [paused: boolean];
  /** The person asked to edit how it runs. */
  edit: [];
  /** The person dropped the edits. */
  cancel: [];
  /** The person saved how it runs. */
  save: [value: ScheduleSettingsValue];
  /** The person confirmed the deletion; awaited, the dialog's Delete schedule is busy until it settles. */
  delete: [];
}
</script>

<script lang="ts" setup>
import { ArrowLeft, CalendarX, ChevronRight, Folder, Trash2 } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { useEmitAsync } from '@nzyme/vue-utils/useEmitAsync.js';
import { useId } from 'vue';
import { RouterLink } from 'vue-router';

import Button from './Button.vue';
import HistoryRow from './HistoryRow.vue';
import ScheduleDeleteDialog from './ScheduleDeleteDialog.vue';
import * as l from './ScheduleLayout.loc.js';
import ScheduleSettings from './ScheduleSettings.vue';
import ScheduleTile from './ScheduleTile.vue';
import Spinner from './Spinner.vue';
import Switch from './Switch.vue';

const props = defineProps(ScheduleLayoutProps);
const emit = defineEmits<ScheduleLayoutEvents>();
/** The delete dialog shows: Delete opens it, Cancel and Escape close it, the parent closes it once deleted. */
const deleteOpen = defineModel<boolean>('deleteOpen', { default: false });

const emitAsync = useEmitAsync<ScheduleLayoutEvents>();
const t = useTranslate();
const runsId = useId();

function confirmDelete() {
  return emitAsync('delete');
}
</script>

<template>
  <div :class="[$style.scheduleLayout, $style[`scheduleLayout_${props.projectColor}`]]">
    <nav :aria-label="t(l.breadcrumb)">
      <ol :class="$style.scheduleLayout_breadcrumb">
        <li :class="$style.scheduleLayout_crumb">
          <RouterLink
            :to="props.schedulesTo"
            :class="$style.scheduleLayout_crumbLink"
            >{{ t(l.schedules) }}</RouterLink
          >
          <ChevronRight
            :class="$style.scheduleLayout_crumbChevron"
            aria-hidden="true"
          />
        </li>
        <li
          :class="$style.scheduleLayout_crumb"
          aria-current="page"
        >
          {{ props.name }}
        </li>
      </ol>
    </nav>
    <div
      v-if="props.gone"
      :class="$style.scheduleLayout_gone"
    >
      <ScheduleTile
        large
        :icon="CalendarX"
      />
      <h1 :class="$style.scheduleLayout_goneTitle">{{ t(l.goneTitle) }}</h1>
      <p :class="$style.scheduleLayout_goneBody">
        {{ t(l.goneBody, { name: props.name, project: props.projectName }) }}
      </p>
      <RouterLink
        :to="props.schedulesTo"
        :class="$style.scheduleLayout_back"
      >
        <ArrowLeft
          :class="$style.scheduleLayout_backIcon"
          aria-hidden="true"
        />
        {{ t(l.back) }}
      </RouterLink>
    </div>
    <template v-else>
      <header :class="$style.scheduleLayout_header">
        <ScheduleTile large />
        <div :class="$style.scheduleLayout_heading">
          <h1 :class="$style.scheduleLayout_title">{{ props.name }}</h1>
          <p :class="$style.scheduleLayout_meta">
            {{ t(l.runsIn) }}
            <RouterLink
              :to="props.projectTo"
              :class="$style.scheduleLayout_project"
            >
              <Folder
                :class="$style.scheduleLayout_folder"
                aria-hidden="true"
              />
              {{ props.projectName }}
            </RouterLink>
          </p>
        </div>
        <div :class="$style.scheduleLayout_actions">
          <!-- The switch says its state itself; the word repeats it for the eye. -->
          <span
            :class="$style.scheduleLayout_state"
            aria-hidden="true"
            >{{ props.paused ? t(l.off) : t(l.on) }}</span
          >
          <Switch
            :model-value="!props.paused"
            :label="props.name"
            @update:model-value="emit('update:paused', !$event)"
          />
          <Button
            variant="ghost"
            :icon="Trash2"
            @click="deleteOpen = true"
          >
            {{ t(l.delete) }}
          </Button>
        </div>
      </header>
      <div :class="$style.scheduleLayout_body">
        <section
          :class="$style.scheduleLayout_runs"
          :aria-labelledby="runsId"
        >
          <h2
            :id="runsId"
            :class="$style.scheduleLayout_runsTitle"
          >
            {{ t(l.runs) }}
          </h2>
          <Spinner
            v-if="props.runsLoading"
            :class="$style.scheduleLayout_spinner"
            :label="t(l.loadingRuns)"
          />
          <div
            v-else-if="props.runs.length"
            :class="$style.scheduleLayout_list"
          >
            <HistoryRow
              v-for="run in props.runs"
              :key="run.id"
              :day="run.day"
              :time="run.time"
              :status="run.status"
              :title="run.title"
              :status-in-title="run.statusInTitle"
              :detail="run.detail"
              :to="run.to"
            />
          </div>
          <p
            v-else
            :class="[$style.scheduleLayout_list, $style.scheduleLayout_noRuns]"
          >
            {{ props.nextAt == null || props.paused ? t(l.noRuns) : t(l.noRunsNext, { at: props.nextAt }) }}
          </p>
        </section>
        <ScheduleSettings
          :class="$style.scheduleLayout_settings"
          :name="props.name"
          :prompt="props.prompt"
          :when="props.when"
          :preset="props.preset"
          :project-name="props.projectName"
          :project-color="props.projectColor"
          :editing="props.editing"
          :saving="props.saving"
          :error="props.saveError"
          @edit="emit('edit')"
          @cancel="emit('cancel')"
          @save="emit('save', $event)"
        />
      </div>
      <ScheduleDeleteDialog
        v-model:open="deleteOpen"
        :name="props.name"
        :project-name="props.projectName"
        @confirm="confirmDelete"
      />
    </template>
  </div>
</template>

<style lang="scss" module>
@include project-color-modifiers(scheduleLayout);

$settings-width: 340px;

.scheduleLayout {
  // The containing block of what it scrolls: absolutely positioned content would otherwise lengthen the window.
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: $spacing-24;
  min-height: 0;
  padding: $spacing-28 + $spacing-04 $spacing-48 $spacing-24;
  overflow-y: auto;
  color: $color-ink;
  line-height: $line-height-snug;
}

.scheduleLayout_breadcrumb {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-06;
  align-items: center;
  margin: 0;
  padding: 0;
  font-size: $font-size-control;
  list-style: none;
}

.scheduleLayout_crumb {
  display: flex;
  gap: $spacing-06;
  align-items: center;
  color: $color-ink-muted;
}

.scheduleLayout_crumbLink {
  color: $color-link-ink;
  font-weight: $font-weight-semibold;
  text-decoration: none;

  @include focus-ring;
  @include hover {
    text-decoration: underline;
  }
}

.scheduleLayout_crumbChevron {
  width: 13px;
  height: 13px;
  color: $color-ink-faint;
}

.scheduleLayout_header {
  display: flex;
  gap: $spacing-16;
  align-items: center;
}

.scheduleLayout_heading {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: $spacing-02;
  min-width: 0;
}

.scheduleLayout_title {
  margin: 0;
  @include font-heading;
  font-size: $font-size-title-s;
  font-weight: $font-weight-bold;
  line-height: $line-height-tight;
  overflow-wrap: anywhere;
}

.scheduleLayout_meta {
  display: flex;
  gap: $spacing-06;
  align-items: center;
  margin: 0;
  color: $color-ink-muted;
  font-size: $font-size-small;
}

.scheduleLayout_project {
  display: inline-flex;
  gap: $spacing-06;
  align-items: center;
  color: $color-link-ink;
  font-weight: $font-weight-semibold;
  text-decoration: none;

  @include focus-ring;
  @include hover {
    text-decoration: underline;
  }
}

.scheduleLayout_folder {
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--project-color);
}

.scheduleLayout_actions {
  display: flex;
  flex: none;
  gap: $spacing-08;
  align-items: center;
}

.scheduleLayout_state {
  font-size: $font-size-small;
  font-weight: $font-weight-semibold;
}

.scheduleLayout_body {
  display: flex;
  gap: $spacing-28;
  align-items: flex-start;
}

.scheduleLayout_runs {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: $spacing-08;
  min-width: 0;
}

// `ink-muted`, not the design's `ink-faint`: this is text, and `ink-faint` is under 4.5:1.
.scheduleLayout_runsTitle {
  margin: 0;
  color: $color-ink-muted;
  font-size: $font-size-micro;
  font-weight: $font-weight-semibold;
  letter-spacing: $letter-spacing-list-head;
  text-transform: uppercase;
}

.scheduleLayout_list {
  margin: 0;
  overflow: hidden;
  border: 1px solid $color-border;
  border-radius: $radius-l;
}

.scheduleLayout_noRuns {
  padding: $spacing-18 $spacing-16;
  color: $color-ink-muted;
  font-size: $font-size-body-s;
}

.scheduleLayout_spinner {
  align-self: center;
  margin-top: $spacing-24;
  font-size: $font-size-heading;
}

.scheduleLayout_settings {
  flex: none;
  width: $settings-width;
}

.scheduleLayout_gone {
  display: flex;
  flex-direction: column;
  gap: $spacing-14;
  align-items: center;
  padding-top: $spacing-120 - $spacing-24;
  text-align: center;
}

.scheduleLayout_goneTitle {
  margin: 0;
  @include font-heading;
  font-size: $font-size-heading;
  font-weight: $font-weight-bold;
  line-height: $line-height-tight;
}

.scheduleLayout_goneBody {
  max-width: 440px;
  margin: 0;
  color: $color-ink-body;
  font-size: $font-size-body;
  line-height: $line-height-relaxed;
  text-wrap: pretty;
}

.scheduleLayout_back {
  display: inline-flex;
  gap: $spacing-06;
  align-items: center;
  padding-top: $spacing-04;
  color: $color-link-ink;
  font-size: $font-size-body-s;
  font-weight: $font-weight-semibold;
  text-decoration: none;

  @include focus-ring;
  @include hover {
    text-decoration: underline;
  }
}

.scheduleLayout_backIcon {
  width: 14px;
  height: 14px;
}
</style>
