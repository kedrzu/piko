<!-- A labelled group of checkboxes, one per option, any number chosen; its value is the chosen options in their order. An error shows under it. -->

<script lang="ts">
import { defineFormField } from '@nzyme/vue-forms/components/defineFormField.js';
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import type { PropType } from 'vue';

const CHECKBOX_GROUP_FIELD = defineFormField<readonly string[]>(Array);

export const CheckboxGroupProps = {
  ...CHECKBOX_GROUP_FIELD.props,
  /** The visible label of the group, also its accessible name. */
  label: { type: String, required: true },
  /** The options, each its own label and value. */
  options: { type: Array as PropType<readonly string[]>, required: true },
  /** A line under the group; an error takes its place. */
  help: defineProp<string>(),
  /** Marks the label "(optional)"; leave it off for a required field, which carries no mark. */
  optional: Boolean,
} as const;
export const CheckboxGroupEmits = CHECKBOX_GROUP_FIELD.emits;
</script>

<script lang="ts" setup>
import Checkbox from './Checkbox.vue';
import FieldFrame from './FieldFrame.vue';

const props = defineProps(CheckboxGroupProps);
defineEmits(CheckboxGroupEmits);

const field = CHECKBOX_GROUP_FIELD.create({ props });

function toggle(option: string, checked: boolean | null | undefined) {
  const chosen = new Set(field.value ?? []);
  if (checked) {
    chosen.add(option);
  } else {
    chosen.delete(option);
  }
  // In the options' order, whatever order they were clicked in.
  field.value = props.options.filter(item => chosen.has(item));
}
</script>

<template>
  <FieldFrame
    :label="props.label"
    :help="props.help"
    :error="field.errors[0]"
    :optional="props.optional"
    group
    @focusin="field.inputAttrs.onFocus"
    @focusout="field.inputAttrs.onBlur"
  >
    <div :class="$style.checkboxGroup">
      <Checkbox
        v-for="option in props.options"
        :key="option"
        :model-value="field.value?.includes(option) ?? false"
        :disabled="props.disabled"
        :readonly="props.readonly"
        :aria-invalid="field.errors.length > 0 || undefined"
        @update:model-value="checked => toggle(option, checked)"
      >
        {{ option }}
      </Checkbox>
    </div>
  </FieldFrame>
</template>

<style lang="scss" module>
.checkboxGroup {
  display: flex;
  flex-direction: column;
  gap: $spacing-06;
}
</style>
