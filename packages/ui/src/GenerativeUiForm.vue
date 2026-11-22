<!-- A small form the agent asks the person to fill in, in the element card: its fields, then its buttons, the writing caret while it appears. A button (or Enter, for the first one) answers with its label and the filled fields; passed over (the person typed instead, or a later UI took its place), the card loses its fill. -->

<script lang="ts">
import type { PropType } from 'vue';

import type { GenerativeUiAnswer } from '@piko/common/generativeUi/GenerativeUiAnswer.js';

import type { GenerativeUiForm } from './GenerativeUiTree.js';

export const GenerativeUiFormProps = {
  /** The form as the program describes it, growing while it streams. */
  form: { type: Object as PropType<GenerativeUiForm>, required: true },
  /** The UI does not take answers (yet, or any more): every control is disabled. */
  disabled: Boolean,
  /** The conversation has moved on: the card loses its fill and keeps an outline. */
  answered: Boolean,
  /** The agent is still writing the form: the caret shows at its end. */
  writing: Boolean,
} as const;

/** What the form reports. */
export interface GenerativeUiFormEvents {
  /** The person submitted the form: the clicked button and the filled fields, in form order. Awaited. */
  answer: [answer: GenerativeUiAnswer];
}
</script>

<script lang="ts" setup>
import Form from '@nzyme/vue-forms/components/Form.vue';
import { provideContext } from '@nzyme/vue-utils/context.js';
import { useEmitAsync } from '@nzyme/vue-utils/useEmitAsync.js';

import type { GenerativeUiAnswerField } from '@piko/common/generativeUi/GenerativeUiAnswer.js';

import Button from './Button.vue';
import GenerativeUiField from './GenerativeUiField.vue';
import { GenerativeUiFormContext } from './GenerativeUiFormContext.js';
import RichText from './RichText.vue';

const props = defineProps(GenerativeUiFormProps);
defineEmits<GenerativeUiFormEvents>();

const model = provideContext(GenerativeUiFormContext);
const emitAsync = useEmitAsync<GenerativeUiFormEvents>();
/** The index of the button that started this submission; Enter submits with the first. */
let clickedIndex = 0;

async function submit() {
  const index = clickedIndex;
  clickedIndex = 0;
  const button = props.form.buttons[index];
  if (props.disabled || button == null || !(await model.validate())) {
    return;
  }

  await emitAsync('answer', {
    kind: 'generativeUiAnswer',
    source: 'form',
    ...(props.form.name === undefined ? {} : { name: props.form.name }),
    button: button.label,
    defaultButton: index === 0,
    fields: readFilledFields(),
  });
}

function choose(index: number) {
  clickedIndex = index;
}

function readFilledFields() {
  const fields: GenerativeUiAnswerField[] = [];
  for (const { name, label } of props.form.fields) {
    const value = model.value[name];
    if (typeof value === 'string') {
      if (value.trim() !== '') {
        fields.push({ name, label, value });
      }
    } else if (value != null && value.length > 0) {
      fields.push({ name, label, value: [...value] });
    }
  }
  return fields;
}
</script>

<template>
  <Form
    :class="[$style.generativeUiForm, props.answered && $style.generativeUiForm_answered]"
    @submit="submit"
  >
    <GenerativeUiField
      v-for="field in props.form.fields"
      :key="`${field.type}:${field.name}`"
      :field="field"
      :disabled="props.disabled"
    />
    <div
      v-if="props.form.buttons.length"
      :class="$style.generativeUiForm_buttons"
    >
      <Button
        v-for="(button, index) in props.form.buttons"
        :key="index"
        type="submit"
        :variant="button.variant ?? (index === 0 ? 'primary' : 'secondary')"
        :disabled="props.disabled"
        @click="choose(index)"
      >
        {{ button.label }}
      </Button>
    </div>
    <RichText
      v-if="props.writing"
      markdown=""
      caret
    />
  </Form>
</template>

<style lang="scss" module>
.generativeUiForm {
  display: flex;
  flex-direction: column;
  gap: $spacing-18;
  padding: calc($spacing-16 - 1px);
  // The same outline as an answered card's, in the fill's colour: the card keeps its size when it turns.
  border: 1px solid $color-surface-soft;
  border-radius: $radius-l;
  background: $color-surface-soft;
}

.generativeUiForm_answered {
  border-color: $color-border;
  background: $color-surface;
}

.generativeUiForm_buttons {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-08;
  padding-top: $spacing-04;
}
</style>
