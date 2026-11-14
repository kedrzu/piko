<!-- One field of a generative UI form — a one-line or multi-line text field, a dropdown or checkboxes — bound to the form's state under its name; an optional one says so in its label, a required one when left empty. -->

<script lang="ts">
import type { PropType } from 'vue';

import type { GenerativeUiField } from './GenerativeUiTree.js';

export const GenerativeUiFieldProps = {
  /** The field as the program describes it. Its type and name must not change: key the component by both. */
  field: { type: Object as PropType<GenerativeUiField>, required: true },
  /** The UI no longer takes answers. */
  disabled: Boolean,
} as const;
</script>

<script lang="ts" setup>
import { useFormField } from '@nzyme/vue-forms/useFormField.js';
import { requiredValidator } from '@nzyme/vue-forms/validators/requiredValidator.js';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { injectContext } from '@nzyme/vue-utils/context.js';
import { computed } from 'vue';

import CheckboxGroup from './CheckboxGroup.vue';
import * as l from './GenerativeUiField.loc.js';
import { GenerativeUiFormContext } from './GenerativeUiFormContext.js';
import SelectField from './SelectField.vue';
import TextAreaField from './TextAreaField.vue';
import TextField from './TextField.vue';

const props = defineProps(GenerativeUiFieldProps);

const t = useTranslate();
const form = injectContext(GenerativeUiFormContext);
// One of the two, by the field's value type; the component is keyed by the field's type, so it never switches.
const textField = props.field.type === 'CheckboxGroup' ? null : createTextField();
const optionsField = props.field.type === 'CheckboxGroup' ? createOptionsField() : null;

function createTextField() {
  return useFormField(form, {
    value: computed({
      get: () => {
        const value = form.value[props.field.name];
        return typeof value === 'string' ? value : '';
      },
      set: (value: string) => {
        form.value[props.field.name] = value;
      },
    }),
    validators: props.field.required ? [requiredValidator<string>({ message: () => t(l.required) })] : [],
    key: () => props.field.name,
  });
}

function createOptionsField() {
  return useFormField(form, {
    value: computed({
      get: (): readonly string[] => {
        const value = form.value[props.field.name];
        return typeof value === 'string' || value == null ? [] : value;
      },
      set: (value: readonly string[]) => {
        form.value[props.field.name] = value;
      },
    }),
    validators: props.field.required ? [requiredValidator<readonly string[]>({ message: () => t(l.required) })] : [],
    key: () => props.field.name,
  });
}
</script>

<template>
  <TextField
    v-if="props.field.type === 'TextInput' && textField"
    :field="textField"
    :label="props.field.label"
    :placeholder="props.field.placeholder"
    :required="props.field.required"
    :optional="!props.field.required"
    :disabled="props.disabled"
  />
  <TextAreaField
    v-else-if="props.field.type === 'TextArea' && textField"
    :field="textField"
    :label="props.field.label"
    :placeholder="props.field.placeholder"
    :required="props.field.required"
    :optional="!props.field.required"
    :disabled="props.disabled"
  />
  <SelectField
    v-else-if="props.field.type === 'Select' && textField"
    :field="textField"
    :label="props.field.label"
    :options="props.field.options"
    :required="props.field.required"
    :optional="!props.field.required"
    :disabled="props.disabled"
  />
  <CheckboxGroup
    v-else-if="props.field.type === 'CheckboxGroup' && optionsField"
    :field="optionsField"
    :label="props.field.label"
    :options="props.field.options"
    :required="props.field.required"
    :optional="!props.field.required"
    :disabled="props.disabled"
  />
</template>
