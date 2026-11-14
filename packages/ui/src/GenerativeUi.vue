<!-- Choices and small forms the agent writes into its reply (an OpenUI program): text, a row of buttons bare under it, a form in a card. Shown while the program streams, never as code, with the writing caret at its end; a click or a submitted form becomes the person's reply once the program is complete and the UI active; once answered, the picked button keeps a check. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';

export const GenerativeUiProps = {
  /** The OpenUI program, without its code fence; it may be cut off while it streams. */
  source: { type: String, required: true },
  /** No more of the program will come. Until then the controls are disabled: a button may still be half written. */
  complete: Boolean,
  /** The UI takes answers (the latest reply's); otherwise its controls are disabled and nothing is sent. */
  active: Boolean,
  /**
   * The person's message that followed this UI. In an inactive UI the choice whose message it is (trimmed, exactly)
   * shows as chosen, so scrolling back shows what was picked.
   */
  answer: defineProp<string>(),
  /**
   * The UI was answered or passed over (the person replied after it, or a later UI of the reply took its place): a form
   * loses its card's fill. An inactive UI that is not answered (the agent still writing its reply) keeps it.
   */
  answered: Boolean,
} as const;

/** What the UI reports. */
export interface GenerativeUiEvents {
  /** The person's reply, to send as their next message: a button's message, with a form's filled fields. Awaited. */
  reply: [text: string];
}
</script>

<script lang="ts" setup>
import { useEmitAsync } from '@nzyme/vue-utils/useEmitAsync.js';
import { createStreamingParser, evaluateRoot } from '@openuidev/lang-core';
import { computed } from 'vue';

import {
  GenerativeUiLibrary,
  GenerativeUiRoot,
  GenerativeUiSchema,
} from '@poweragents/common/generativeUi/generativeUiLibrary.js';

import Button from './Button.vue';
import GenerativeUiForm from './GenerativeUiForm.vue';
import { readGenerativeUiTree } from './GenerativeUiTree.js';
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
const chosenMessage = computed(() => (props.active ? undefined : props.answer?.trim()));
const lastBlock = computed(() => blocks.value.at(-1));

async function reply(text: string) {
  if (interactive.value) {
    await emitAsync('reply', text);
  }
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
          :chosen="chosenMessage !== undefined && button.message.trim() === chosenMessage"
          @click="reply(button.message)"
        >
          {{ button.label }}
        </Button>
      </div>
      <GenerativeUiForm
        v-else
        :form="block"
        :disabled="!interactive"
        :answered="props.answered"
        :writing="!props.complete && block === lastBlock"
        @reply="reply"
      />
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
