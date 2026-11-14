<!-- A labelled one-line text field with an optional help line under it; an error takes the help line's place. -->

<script lang="ts">
import { useTextInput } from '@nzyme/vue-forms/components/useTextInput.jsx';
import { defineProp } from '@nzyme/vue-utils/defineProp.js';

export const TextFieldProps = {
  ...useTextInput.props,
  /** The visible label, also the input's accessible name. */
  label: { type: String, required: true },
  /** A line under the field; an error takes its place. */
  help: defineProp<string>(),
  /** Marks the label "(optional)"; leave it off for a required field, which carries no mark. */
  optional: Boolean,
} as const;
export const TextFieldEmits = useTextInput.emits;
</script>

<script lang="ts" setup>
import FieldFrame from './FieldFrame.vue';

const props = defineProps(TextFieldProps);
defineEmits(TextFieldEmits);

const { TextInput, field } = useTextInput();
</script>

<template>
  <FieldFrame
    v-slot="{ controlId, labelId, describedBy, invalid }"
    :label="props.label"
    :help="props.help"
    :error="field.errors[0]"
    :optional="props.optional"
  >
    <TextInput
      :id="controlId"
      :aria-labelledby="labelId"
      :class="$style.textField"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy"
    />
  </FieldFrame>
</template>

<style lang="scss" module>
.textField {
  width: 100%;
  height: 48px;
  padding: 0 calc($spacing-14 - 1px);
  border: 1px solid $color-field-border;
  border-radius: $radius-m;
  background: $color-surface;
  color: $color-ink;
  font: inherit;
  font-size: $font-size-body;

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
