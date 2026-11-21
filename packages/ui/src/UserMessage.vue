<!-- What the person wrote, in a soft bubble on the right; line breaks kept, nothing formatted. An answer to the agent's form shows in it as each filled field's label over its value, then the clicked button's label unless it was the default send; a picked choice as its label. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';

import type { GenerativeUiAnswer } from '@piko/common/generativeUi/GenerativeUiAnswer.js';

export const UserMessageProps = {
  /** What the person wrote; shown when the message is not an answer to generated UI. */
  text: { type: String, required: true },
  /** Set when the message answered generated UI: the bubble shows exactly what the person saw and chose. */
  answer: defineProp<GenerativeUiAnswer>(),
} as const;
</script>

<script lang="ts" setup>
import { Check } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { computed } from 'vue';

import * as l from './UserMessage.loc.js';

const props = defineProps(UserMessageProps);

const t = useTranslate();
const fields = computed(() => props.answer?.fields ?? []);
/** The text under the answers: the clicked button's label, only when it says more than "send" or stands alone. */
const text = computed(() => {
  const answer = props.answer;
  if (answer == null) {
    return props.text;
  }
  return !answer.defaultButton || answer.fields.length === 0 ? answer.button : undefined;
});
</script>

<template>
  <div :class="$style.userMessage">
    <div :class="[$style.userMessage_bubble, props.answer && $style.userMessage_answer]">
      <span :class="$style.userMessage_author">{{ t(l.author) }}</span>
      <dl
        v-if="fields.length"
        :class="$style.userMessage_fields"
      >
        <div
          v-for="field in fields"
          :key="field.name"
          :class="$style.userMessage_field"
        >
          <dt :class="$style.userMessage_label">
            {{ field.label }}
          </dt>
          <template v-if="typeof field.value === 'string'">
            <dd :class="$style.userMessage_value">
              {{ field.value }}
            </dd>
          </template>
          <template v-else>
            <dd
              v-for="pick in field.value"
              :key="pick"
              :class="[$style.userMessage_value, $style.userMessage_pick]"
            >
              <Check
                :class="$style.userMessage_check"
                aria-hidden="true"
              />
              {{ pick }}
            </dd>
          </template>
        </div>
      </dl>
      <p
        v-if="text !== undefined"
        :class="$style.userMessage_text"
      >
        {{ text }}
      </p>
    </div>
  </div>
</template>

<style lang="scss" module>
.userMessage {
  display: flex;
  justify-content: flex-end;
}

.userMessage_bubble {
  display: flex;
  flex-direction: column;
  gap: $spacing-14;
  max-width: 85%;
  padding: $spacing-10 $spacing-16;
  border-radius: $radius-l;
  background: $color-surface-soft;
  color: $color-ink;
  font-size: $font-size-body;
  line-height: $line-height-relaxed;
  overflow-wrap: anywhere;
}

// An answer arrives as its form collapses in the agent's reply: it eases in rather than popping up.
.userMessage_answer {
  animation: user-message-enter $duration-fast ease-out;

  @include reduced-motion {
    animation: none;
  }
}

.userMessage_text {
  margin: 0;
  white-space: pre-wrap;
}

.userMessage_fields {
  display: flex;
  flex-direction: column;
  gap: $spacing-14;
  margin: 0;
}

.userMessage_field {
  display: flex;
  flex-direction: column;
  gap: $spacing-02;
}

.userMessage_label {
  color: $color-ink-muted;
  font-size: $font-size-control;
  line-height: $line-height-snug;
}

.userMessage_value {
  margin: 0;
  white-space: pre-line;
}

.userMessage_pick {
  display: flex;
  gap: $spacing-10;
  align-items: center;
}

.userMessage_check {
  flex: none;
  width: 14px;
  height: 14px;
  color: $color-brand-1-strong;
}

.userMessage_author {
  @include visually-hidden;
}

@keyframes user-message-enter {
  from {
    opacity: 0;
    transform: translateY($spacing-04);
  }
}
</style>
