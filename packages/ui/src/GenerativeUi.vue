<!-- Choices and small forms the agent writes into its reply (an OpenUI program): text, a row of buttons bare under it, a form in a card. Shown while the program streams, never as code, with the writing caret at its end; a click or a submitted form answers once the program is complete and the UI active; once answered, the picked button keeps a check and an answered form collapses away (the person's message shows its answers). -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';

import type { GenerativeUiAnswer } from '@piko/common/generativeUi/GenerativeUiAnswer.js';

export const GenerativeUiProps = {
  /** The OpenUI program, without its code fence; it may be cut off while it streams. */
  source: { type: String, required: true },
  /** No more of the program will come. Until then the controls are disabled: a button may still be half written. */
  complete: Boolean,
  /** The UI takes answers (the latest reply's); otherwise its controls are disabled and nothing is sent. */
  active: Boolean,
  /**
   * What the person sent after this UI, so scrolling back shows what was picked. An answer through the UI checks its
   * choice, or removes its form (collapsing it when the answer arrives): the person's message shows the form's answers.
   * Plain text — typed, or an answer from before answers were structured — checks the choice whose label (or old
   * program's message) it is, trimmed, exactly. Read only while the UI is inactive.
   */
  answer: defineProp<string | GenerativeUiAnswer>(),
  /**
   * The UI was answered or passed over (the person replied after it, or a later UI of the reply took its place): a form
   * loses its card's fill. An inactive UI that is not answered (the agent still writing its reply) keeps it.
   */
  answered: Boolean,
} as const;

/** What the UI reports. */
export interface GenerativeUiEvents {
  /** The person's answer, to send as their next message: a choice's label, or a form's button and filled fields. Awaited. */
  answer: [answer: GenerativeUiAnswer];
}
</script>

<script lang="ts" setup>
import Reveal from '@nzyme/vue/components/Reveal.vue';
import { useEmitAsync } from '@nzyme/vue-utils/useEmitAsync.js';
import { createStreamingParser, evaluateRoot } from '@openuidev/lang-core';
import { computed, ref } from 'vue';

import {
  GenerativeUiLibrary,
  GenerativeUiRoot,
  GenerativeUiSchema,
} from '@piko/common/generativeUi/generativeUiLibrary.js';

import Button from './Button.vue';
import GenerativeUiForm from './GenerativeUiForm.vue';
import { readGenerativeUiTree } from './GenerativeUiTree.js';
import type {
  GenerativeUiButton,
  GenerativeUiButtons,
  GenerativeUiForm as GenerativeUiFormBlock,
} from './GenerativeUiTree.js';
import RichText from './RichText.vue';

const props = defineProps(GenerativeUiProps);
defineEmits<GenerativeUiEvents>();

const emitAsync = useEmitAsync<GenerativeUiEvents>();
// Holds what it has parsed: `set` feeds it only the text appended since the last call.
const parser = createStreamingParser(GenerativeUiSchema, GenerativeUiRoot);
const blocks = computed(() =>
  readGenerativeUiTree(
    evaluateRoot(parser.set(props.source, props.complete), {
      ctx: { getState: () => null, resolveRef: () => null },
      library: GenerativeUiLibrary,
      store: null,
    }),
  ),
);
const interactive = computed(() => props.active && props.complete);
const inactiveAnswer = computed(() => (props.active || props.answer == null ? undefined : props.answer));
const lastBlock = computed(() => blocks.value.at(-1));
/**
 * The answered form has left: present already when the UI mounts, or collapsed since. Until then its `Reveal` stays,
 * so the form collapses rather than vanishing; once gone, the empty `Reveal` goes too, taking no gap in the column.
 */
const answeredFormGone = ref(isFormAnswer(inactiveAnswer.value));

async function answer(value: GenerativeUiAnswer) {
  if (interactive.value) {
    await emitAsync('answer', value);
  }
}

async function choose(block: GenerativeUiButtons, button: GenerativeUiButton) {
  await answer({
    kind: 'generativeUiAnswer',
    source: 'choices',
    ...(block.name === undefined ? {} : { name: block.name }),
    button: button.label,
    defaultButton: true,
    fields: [],
  });
}

function isChosen(block: GenerativeUiButtons, button: GenerativeUiButton) {
  const value = inactiveAnswer.value;
  if (value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    const text = value.trim();
    return button.label.trim() === text || button.legacyMessage?.trim() === text;
  }
  return value.source === 'choices' && value.name === block.name && value.button === button.label;
}

function isAnswered(form: GenerativeUiFormBlock) {
  const value = inactiveAnswer.value;
  return isFormAnswer(value) && value.name === form.name;
}

function isFormAnswer(value: string | GenerativeUiAnswer | undefined): value is GenerativeUiAnswer {
  return typeof value === 'object' && value.source === 'form';
}
</script>

<template>
  <div :class="$style.generativeUi">
    <template
      v-for="(block, index) in blocks"
      :key="`${index}:${block.type}`"
    >
      <p
        v-if="block.type === 'Text'"
        :class="$style.generativeUi_text"
      >
        {{ block.text }}
      </p>
      <div
        v-else-if="block.type === 'Buttons'"
        :class="$style.generativeUi_buttons"
      >
        <Button
          v-for="(button, buttonIndex) in block.buttons"
          :key="buttonIndex"
          :variant="button.variant ?? 'secondary'"
          :disabled="!interactive"
          :chosen="isChosen(block, button)"
          @click="choose(block, button)"
        >
          {{ button.label }}
        </Button>
      </div>
      <Reveal
        v-else-if="!(answeredFormGone && isAnswered(block))"
        @after-leave="answeredFormGone = true"
      >
        <GenerativeUiForm
          v-if="!isAnswered(block)"
          key="form"
          :form="block"
          :disabled="!interactive"
          :answered="props.answered"
          :writing="!props.complete && block === lastBlock"
          @answer="answer"
        />
      </Reveal>
    </template>
    <!-- A form shows the caret inside its card. -->
    <RichText
      v-if="!props.complete && lastBlock?.type !== 'Form'"
      markdown=""
      caret
    />
  </div>
</template>

<style lang="scss" module>
.generativeUi {
  display: flex;
  flex-direction: column;
  gap: $spacing-14;

  &:empty {
    display: none;
  }
}

.generativeUi_text {
  margin: 0;
  color: $color-ink;
  font-size: $font-size-body-l;
  line-height: $line-height-relaxed;
  overflow-wrap: anywhere;
  white-space: pre-line;
}

.generativeUi_buttons {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-08;
}
</style>
