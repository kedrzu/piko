<!-- A labelled dropdown that picks one of its options, starting on a "Choose…" prompt; an error shows under it. -->

<script lang="ts">
import { useSelectInput } from '@nzyme/vue-forms/components/useSelectInput.jsx';
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import type { PropType } from 'vue';

export const SelectFieldProps = {
  ...useSelectInput.props,
  /** The visible label (with its "(optional)" mark), the dropdown's accessible name. */
  label: { type: String, required: true },
  /** The options, each its own label and value. */
  options: { type: Array as PropType<readonly string[]>, required: true },
  /** A line under the field; an error takes its place. */
  help: defineProp<string>(),
  /** Marks the label "(optional)"; leave it off for a required field, which carries no mark. */
  optional: Boolean,
} as const;
export const SelectFieldEmits = useSelectInput.emits;
</script>

<script lang="ts" setup>
import { ChevronDown } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';

import FieldFrame from './FieldFrame.vue';
import * as l from './SelectField.loc.js';

const props = defineProps(SelectFieldProps);
defineEmits(SelectFieldEmits);

const { SelectInput, field } = useSelectInput();
const t = useTranslate();
</script>

<template>
  <FieldFrame
    v-slot="{ controlId, labelId, describedBy, invalid }"
    :label="props.label"
    :help="props.help"
    :error="field.errors[0]"
    :optional="props.optional"
  >
    <span :class="$style.selectField">
      <SelectInput
        :id="controlId"
        :class="[$style.selectField_input, invalid && $style.selectField_invalid]"
        :aria-labelledby="labelId"
        :aria-invalid="invalid || undefined"
        :aria-describedby="describedBy"
      >
        <option value="">{{ props.placeholder ?? t(l.placeholder) }}</option>
        <option
          v-for="option in props.options"
          :key="option"
          :value="option"
        >
          {{ option }}
        </option>
      </SelectInput>
      <ChevronDown
        :class="$style.selectField_chevron"
        aria-hidden="true"
      />
    </span>
  </FieldFrame>
</template>

<style lang="scss" module>
.selectField {
  position: relative;
  display: block;
}

.selectField_input {
  width: 100%;
  height: 48px;
  padding: 0 calc($spacing-14 + 22px) 0 calc($spacing-14 - 1px);
  border: 1px solid $color-field-border;
  border-radius: $radius-m;
  background: $color-surface;
  color: $color-ink;
  font: inherit;
  font-size: $font-size-body;
  appearance: none;
  cursor: pointer;

  &:disabled {
    border-color: $color-border;
    background: $color-surface-soft;
    color: $color-ink-muted;
    cursor: default;
  }
}

.selectField_invalid {
  border-color: $color-attention;
}

.selectField_chevron {
  position: absolute;
  top: 50%;
  right: $spacing-14;
  width: 16px;
  height: 16px;
  color: $color-ink-muted;
  pointer-events: none;
  transform: translateY(-50%);
}
</style>
