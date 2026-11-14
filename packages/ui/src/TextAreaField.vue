<!-- A labelled multi-line text field that grows with its text, with an optional help line under it; an error takes the help line's place. -->

<script lang="ts">
import { useTextArea } from '@nzyme/vue-forms/components/useTextArea.jsx';
import { defineProp } from '@nzyme/vue-utils/defineProp.js';

export const TextAreaFieldProps = {
  ...useTextArea.props,
  /** The visible label, also the field's accessible name. */
  label: { type: String, required: true },
  /** A line under the field; an error takes its place. */
  help: defineProp<string>(),
  /** Marks the label "(optional)"; leave it off for a required field, which carries no mark. */
  optional: Boolean,
} as const;
export const TextAreaFieldEmits = useTextArea.emits;
</script>

<script lang="ts" setup>
import FieldFrame from './FieldFrame.vue';

const props = defineProps(TextAreaFieldProps);
defineEmits(TextAreaFieldEmits);

const { TextArea, field } = useTextArea();
</script>

<template>
  <FieldFrame
    v-slot="{ controlId, labelId, describedBy, invalid }"
    :label="props.label"
    :help="props.help"
    :error="field.errors[0]"
    :optional="props.optional"
  >
    <TextArea
      :id="controlId"
      :aria-labelledby="labelId"
      :class="$style.textAreaField"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy"
    />
  </FieldFrame>
</template>

<style lang="scss" module>
.textAreaField {
  display: block;
  width: 100%;
  min-height: 96px;
  max-height: 320px;
  padding: calc($spacing-12 - 1px) calc($spacing-14 - 1px);
  border: 1px solid $color-field-border;
  border-radius: $radius-m;
  background: $color-surface;
  color: $color-ink;
  font: inherit;
  font-size: $font-size-body;
  line-height: $line-height-relaxed;
  resize: none;

  &::placeholder {
    color: $color-ink-muted;
    opacity: 1;
  }

  &:disabled {
    border-color: $color-border;
    background: $color-surface-soft;
    color: $color-ink-muted;
  }

  &[aria-invalid='true'] {
    border-color: $color-attention;
  }
}
</style>
