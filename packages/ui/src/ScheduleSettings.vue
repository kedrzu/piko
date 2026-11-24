<!-- A schedule's "How it runs" panel (screens 10, 75–77): when it runs, what it does and the project it runs in, each with Edit; editing, a form of its name, prompt, repeat, day and time with Save and Cancel, and why the last save failed under it. A rule the form cannot show stays read-only, with a hint to ask the agent. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import type { PropType } from 'vue';

import type { ProjectColor } from './ProjectColor.js';

/** A day of the week as RRULE writes it. */
export type ScheduleSettingsWeekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

/** How often the form's rule repeats. */
export type ScheduleSettingsRepeat = 'daily' | 'weekdays' | 'weekly' | 'monthly';

/** A recurrence the form can set up, shaped as the app's `SchedulePreset`; `time` is `HH:MM`. */
export type ScheduleSettingsPreset =
  | { repeat: 'daily' | 'weekdays'; time: string }
  | { repeat: 'weekly'; weekday: ScheduleSettingsWeekday; time: string }
  | {
      repeat: 'monthly';
      /** 1–28, so that it occurs every month. */
      monthDay: number;
      time: string;
    };

/** What Save reports: the edited name and prompt, and the recurrence unless the rule is one the form cannot show. */
export interface ScheduleSettingsValue {
  name: string;
  prompt: string;
  preset?: ScheduleSettingsPreset;
}

export const ScheduleSettingsProps = {
  name: { type: String, required: true },
  /** What the schedule asks the agent; its line breaks are kept. */
  prompt: { type: String, required: true },
  /** When it runs, as a person says it ("Every day at 8:00"). */
  when: { type: String, required: true },
  /** The recurrence, as the form edits it; without one the rule is shown read-only, with a hint to ask the agent. */
  preset: defineProp<ScheduleSettingsPreset>(),
  projectName: { type: String, required: true },
  projectColor: { type: String as PropType<ProjectColor>, required: true },
  /**
   * The form shows. The parent owns it: `edit` asks to turn it on, `cancel` and a saved `save` to turn it off. Focus
   * moves into the form when it turns on and back to the Edit pressed when it turns off.
   */
  editing: Boolean,
  /** A save is in flight: Save is busy and takes no clicks. */
  saving: Boolean,
  /** Why the last save failed, shown under the form and announced. */
  error: defineProp<string>(),
} as const;

export const ScheduleSettingsEmits = {
  /** The person asked to edit. */
  edit: () => true,
  /** The person dropped the edits. */
  cancel: () => true,
  /** The person saved the form, which passed its checks. */
  save: (_value: ScheduleSettingsValue) => true,
};
</script>

<script lang="ts" setup>
import { CircleAlert, Folder, Info } from '@lucide/vue';
import { assertNever } from '@nzyme/utils/assertNever.js';
import Form from '@nzyme/vue-forms/components/Form.vue';
import { useForm } from '@nzyme/vue-forms/useForm.js';
import { useFormFields } from '@nzyme/vue-forms/useFormFields.js';
import { regexValidator } from '@nzyme/vue-forms/validators/regexValidator.js';
import { requiredValidator } from '@nzyme/vue-forms/validators/requiredValidator.js';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue';

import Button from './Button.vue';
import * as l from './ScheduleSettings.loc.js';
import SelectField from './SelectField.vue';
import TextAreaField from './TextAreaField.vue';
import TextField from './TextField.vue';

const props = defineProps(ScheduleSettingsProps);
const emit = defineEmits(ScheduleSettingsEmits);

/** The form's state: the selects hold their options' values as strings. */
interface ScheduleSettingsForm {
  name: string;
  prompt: string;
  repeat: string;
  weekday: string;
  monthDay: string;
  time: string;
}

const WEEKDAYS: readonly ScheduleSettingsWeekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const REPEATS: readonly ScheduleSettingsRepeat[] = ['daily', 'weekdays', 'weekly', 'monthly'];
const MONTH_DAYS = Array.from({ length: 28 }, (_, index) => String(index + 1));
/** `H:MM` or `HH:MM`, 0:00–23:59. */
const TIME_FORMAT = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const t = useTranslate();
const titleId = useId();
const errorId = useId();
const root = useTemplateRef<HTMLElement>('root');
/** The Edit pressed last, which focus returns to once the form closes. */
const editedFrom = ref<'when' | 'prompt'>('when');
const form = useForm(readForm());
const fields = useFormFields(form, {
  name: [requiredValidator()],
  prompt: [requiredValidator()],
  repeat: [],
  weekday: [],
  monthDay: [],
  time: [requiredValidator(), regexValidator({ regex: TIME_FORMAT, message: () => t(l.timeInvalid) })],
});
const repeatOptions = computed(() => REPEATS.map(repeat => ({ value: repeat, label: t(l[repeat]) })));
const weekdayOptions = computed(() => WEEKDAYS.map(weekday => ({ value: weekday, label: t(l[weekday]) })));

watch(
  () => props.editing,
  async editing => {
    if (editing) {
      form.value = readForm();
      form.reset();
    }
    await nextTick();
    const target = editing
      ? root.value?.querySelector<HTMLElement>('input:not([type="submit"]), textarea')
      : root.value?.querySelector<HTMLElement>(`[data-edit="${editedFrom.value}"]`);
    target?.focus();
  },
);

// Focus is on nothing while the save runs (the form blurs it on submit): put it on Save, which the error describes.
watch(
  () => props.error,
  async error => {
    if (!error || !props.editing || (document.activeElement && document.activeElement !== document.body)) {
      return;
    }
    await nextTick();
    root.value?.querySelector<HTMLElement>('[data-save]')?.focus();
  },
);

function edit(from: 'when' | 'prompt') {
  editedFrom.value = from;
  emit('edit');
}

async function save() {
  if (props.saving || !(await form.validate())) {
    return;
  }

  emit('save', {
    name: form.value.name.trim(),
    prompt: form.value.prompt.trim(),
    preset: props.preset ? readPreset() : undefined,
  });
}

function readForm(): ScheduleSettingsForm {
  const preset = props.preset;
  return {
    name: props.name,
    prompt: props.prompt,
    repeat: preset?.repeat ?? 'daily',
    weekday: preset?.repeat === 'weekly' ? preset.weekday : 'MO',
    monthDay: preset?.repeat === 'monthly' ? String(preset.monthDay) : '1',
    // Without the leading zero, as the person writes it ("8:00").
    time: preset?.time.replace(/^0(\d)/, '$1') ?? '',
  };
}

/** The form's recurrence, its time as `HH:MM`; called once the form has passed its checks. */
function readPreset(): ScheduleSettingsPreset {
  const [, hour = '', minute = ''] = TIME_FORMAT.exec(form.value.time.trim()) ?? [];
  const time = `${hour.padStart(2, '0')}:${minute}`;
  const repeat = REPEATS.find(value => value === form.value.repeat) ?? 'daily';
  switch (repeat) {
    case 'daily':
    case 'weekdays':
      return { repeat, time };
    case 'weekly':
      return { repeat, weekday: WEEKDAYS.find(day => day === form.value.weekday) ?? 'MO', time };
    case 'monthly':
      return { repeat, monthDay: Number(form.value.monthDay), time };
    default:
      return assertNever(repeat);
  }
}
</script>

<template>
  <section
    ref="root"
    :class="[$style.scheduleSettings, $style[`scheduleSettings_${props.projectColor}`]]"
    :aria-labelledby="titleId"
  >
    <h2
      :id="titleId"
      :class="$style.scheduleSettings_title"
    >
      {{ t(l.title) }}
    </h2>
    <Form
      v-if="props.editing"
      :class="$style.scheduleSettings_form"
      :aria-labelledby="titleId"
      :aria-describedby="props.error ? errorId : undefined"
      @submit="save"
    >
      <TextField
        :field="fields.name"
        :label="t(l.name)"
        required
      />
      <TextAreaField
        :field="fields.prompt"
        :label="t(l.prompt)"
        required
      />
      <div
        v-if="props.preset"
        :class="$style.scheduleSettings_when"
      >
        <SelectField
          :field="fields.repeat"
          :label="t(l.repeat)"
          :options="repeatOptions"
          no-prompt
        />
        <div :class="$style.scheduleSettings_dayAndTime">
          <SelectField
            v-if="form.value.repeat === 'weekly'"
            :field="fields.weekday"
            :label="t(l.day)"
            :options="weekdayOptions"
            no-prompt
          />
          <SelectField
            v-else-if="form.value.repeat === 'monthly'"
            :field="fields.monthDay"
            :label="t(l.monthDay)"
            :options="MONTH_DAYS"
            no-prompt
          />
          <TextField
            :field="fields.time"
            :label="t(l.time)"
            autocomplete="off"
            required
          />
        </div>
      </div>
      <div
        v-else
        :class="$style.scheduleSettings_rule"
      >
        <span :class="$style.scheduleSettings_ruleLabel">{{ t(l.when) }}</span>
        <span :class="$style.scheduleSettings_ruleValue">{{ props.when }}</span>
        <p :class="$style.scheduleSettings_hint">
          <Info
            :class="$style.scheduleSettings_noteIcon"
            aria-hidden="true"
          />
          <span>{{ t(l.customRule, { project: props.projectName }) }}</span>
        </p>
      </div>
      <div :class="$style.scheduleSettings_item">
        <span :class="$style.scheduleSettings_label">{{ t(l.runsIn) }}</span>
        <span :class="$style.scheduleSettings_project">
          <Folder
            :class="$style.scheduleSettings_folder"
            aria-hidden="true"
          />
          {{ props.projectName }}
        </span>
      </div>
      <div :class="$style.scheduleSettings_actions">
        <Button
          type="submit"
          data-save
          :busy="props.saving"
          :aria-describedby="props.error ? errorId : undefined"
        >
          {{ t(l.save) }}
        </Button>
        <Button
          variant="secondary"
          @click="emit('cancel')"
        >
          {{ t(l.cancel) }}
        </Button>
      </div>
      <p
        v-if="props.error"
        :id="errorId"
        :class="$style.scheduleSettings_error"
        role="alert"
      >
        <CircleAlert
          :class="$style.scheduleSettings_noteIcon"
          aria-hidden="true"
        />
        <span>{{ t(l.saveFailed, { reason: props.error }) }}</span>
      </p>
    </Form>
    <dl
      v-else
      :class="$style.scheduleSettings_list"
    >
      <!-- Edit closes its part, after the value, and sits at the label's end. -->
      <div :class="[$style.scheduleSettings_item, $style.scheduleSettings_editable]">
        <dt :class="$style.scheduleSettings_label">{{ t(l.when) }}</dt>
        <dd :class="$style.scheduleSettings_value">
          {{ props.when }}
          <Button
            variant="inline"
            data-edit="when"
            :class="$style.scheduleSettings_edit"
            :aria-label="t(l.editWhen)"
            @click="edit('when')"
          >
            {{ t(l.edit) }}
          </Button>
        </dd>
      </div>
      <div :class="[$style.scheduleSettings_item, $style.scheduleSettings_editable]">
        <dt :class="$style.scheduleSettings_label">{{ t(l.prompt) }}</dt>
        <dd :class="$style.scheduleSettings_value">
          <span :class="$style.scheduleSettings_prompt">{{ props.prompt }}</span>
          <Button
            variant="inline"
            data-edit="prompt"
            :class="$style.scheduleSettings_edit"
            :aria-label="t(l.editPrompt)"
            @click="edit('prompt')"
          >
            {{ t(l.edit) }}
          </Button>
        </dd>
      </div>
      <div :class="$style.scheduleSettings_item">
        <dt :class="$style.scheduleSettings_label">{{ t(l.runsIn) }}</dt>
        <dd :class="[$style.scheduleSettings_value, $style.scheduleSettings_project]">
          <Folder
            :class="$style.scheduleSettings_folder"
            aria-hidden="true"
          />
          {{ props.projectName }}
        </dd>
      </div>
    </dl>
  </section>
</template>

<style lang="scss" module>
@include project-color-modifiers(scheduleSettings);

.scheduleSettings {
  display: flex;
  flex-direction: column;
  gap: $spacing-16;
  padding: $spacing-22 - $spacing-02;
  border-radius: $radius-l;
  background: $color-surface-soft;
  color: $color-ink;
  line-height: $line-height-snug;
}

.scheduleSettings_title {
  margin: 0;
  font-size: $font-size-body-l;
  font-weight: $font-weight-bold;
}

.scheduleSettings_list,
.scheduleSettings_form {
  display: flex;
  flex-direction: column;
  gap: $spacing-16;
  margin: 0;
}

.scheduleSettings_form {
  gap: $spacing-22 - $spacing-02;
}

.scheduleSettings_item {
  display: flex;
  flex-direction: column;
  gap: $spacing-02;
}

.scheduleSettings_editable {
  position: relative;

  .scheduleSettings_label {
    padding-right: $spacing-48;
  }
}

// On the label's line, its 24px target centred on it.
.scheduleSettings_edit {
  position: absolute;
  top: -$spacing-04;
  right: 0;
}

// `ink-muted`, not the design's `ink-faint`: these are text, and `ink-faint` is under 4.5:1.
.scheduleSettings_label {
  color: $color-ink-muted;
  font-size: $font-size-badge;
}

.scheduleSettings_value {
  margin: 0;
  font-size: $font-size-body-s;
  line-height: $line-height-normal;
}

.scheduleSettings_prompt {
  display: block;
  overflow-wrap: anywhere;
  white-space: pre-line;
}

.scheduleSettings_project {
  display: flex;
  gap: $spacing-06;
  align-items: center;
  font-size: $font-size-body-s;
}

.scheduleSettings_folder {
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--project-color);
}

.scheduleSettings_when {
  display: flex;
  flex-direction: column;
  gap: $spacing-12;
}

.scheduleSettings_dayAndTime {
  display: grid;
  grid-auto-columns: minmax(0, 1fr);
  grid-auto-flow: column;
  gap: $spacing-12;
}

.scheduleSettings_rule {
  display: flex;
  flex-direction: column;
  gap: $spacing-08;
}

.scheduleSettings_ruleLabel {
  font-size: $font-size-control;
  font-weight: $font-weight-semibold;
  line-height: 1.2;
}

.scheduleSettings_ruleValue {
  font-size: $font-size-body;
  line-height: $line-height-normal;
}

.scheduleSettings_hint,
.scheduleSettings_error {
  display: flex;
  gap: $spacing-icon-gap;
  margin: 0;
  color: $color-ink-muted;
  font-size: $font-size-caption;
  line-height: $line-height-normal;
}

.scheduleSettings_error {
  color: $color-attention-ink;
}

.scheduleSettings_noteIcon {
  flex: none;
  width: 14px;
  height: 14px;
  margin-top: $spacing-02;
}

.scheduleSettings_actions {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-08;
}
</style>
