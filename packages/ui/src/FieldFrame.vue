<!-- The frame every form field shares: its label (a legend for a group of controls), the control, and a help line under it that an error replaces. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';

export const FieldFrameProps = {
  /** The visible label, also the control's (or the group's) accessible name. */
  label: { type: String, required: true },
  /** A line under the control; an error takes its place. */
  help: defineProp<string>(),
  /** The first error to show; announced as it appears. */
  error: defineProp<string>(),
  /** Says "(optional)" after the label. Required fields carry no mark: the control's own `required` says it. */
  optional: Boolean,
  /** The control is several inputs (checkboxes): a `fieldset` named by a `legend` instead of a `label`. */
  group: Boolean,
} as const;
</script>

<script lang="ts" setup>
import { CircleAlert } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { computed, useId } from 'vue';

import * as l from './FieldFrame.loc.js';

const props = defineProps(FieldFrameProps);
defineSlots<{
  /**
   * The control: put `controlId` on it as its `id`, `labelId` as its `aria-labelledby` (its name is then the whole
   * visible label, "(optional)" included, whatever `aria-label` the primitive sets) and `describedBy` as its
   * `aria-describedby`.
   */
  default(props: { controlId: string; labelId: string; describedBy: string | undefined; invalid: boolean }): unknown;
}>();

const t = useTranslate();
const controlId = useId();
const labelId = useId();
const noteId = useId();
const describedBy = computed(() => (props.error || props.help ? noteId : undefined));
</script>

<template>
  <component
    :is="props.group ? 'fieldset' : 'div'"
    :class="[$style.fieldFrame, props.error && $style.fieldFrame_invalid]"
    :aria-describedby="props.group ? describedBy : undefined"
  >
    <component
      :is="props.group ? 'legend' : 'label'"
      :id="labelId"
      :for="props.group ? undefined : controlId"
      :class="[$style.fieldFrame_label, props.group && $style.fieldFrame_legend]"
    >
      {{ props.optional ? `${props.label} ${t(l.optional)}` : props.label }}
    </component>
    <slot
      :control-id="controlId"
      :label-id="labelId"
      :described-by="describedBy"
      :invalid="!!props.error"
    />
    <p
      v-if="props.error"
      :id="noteId"
      :class="[$style.fieldFrame_note, $style.fieldFrame_error]"
      role="alert"
    >
      <CircleAlert
        :class="$style.fieldFrame_noteIcon"
        aria-hidden="true"
      />
      <span>{{ props.error }}</span>
    </p>
    <p
      v-else-if="props.help"
      :id="noteId"
      :class="$style.fieldFrame_note"
    >
      {{ props.help }}
    </p>
  </component>
</template>

<style lang="scss" module>
.fieldFrame {
  display: flex;
  flex-direction: column;
  gap: $spacing-08;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.fieldFrame_label {
  padding: 0;
  color: $color-ink;
  font-size: $font-size-control;
  font-weight: $font-weight-semibold;
  line-height: 1.2;

  .fieldFrame:has(:disabled) > & {
    color: $color-ink-muted;
  }
}

// A legend is no flex item of its fieldset: the gap does not reach it.
.fieldFrame_legend {
  margin-bottom: $spacing-08;
}

.fieldFrame_note {
  display: flex;
  gap: $spacing-icon-gap;
  margin: 0;
  color: $color-ink-muted;
  font-size: $font-size-caption;
  line-height: $line-height-normal;
}

.fieldFrame_error {
  color: $color-attention-ink;
}

.fieldFrame_noteIcon {
  flex: none;
  width: 14px;
  height: 14px;
  margin-top: $spacing-02;
}
</style>
