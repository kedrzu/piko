<!-- The agent's reply beside its mark: while it works, its text and steps in the order they come, with a caret; once done, the steps collapsed to their count above the text; then a chip (the `file` slot) for each file it wrote. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import type { PropType } from 'vue';

import type { ConversationAgentPart } from '@piko/common/api/ConversationTypes.js';

export const AgentMessageProps = {
  /** The reply's text and steps, in the order the agent produced them. */
  parts: { type: Array as PropType<readonly ConversationAgentPart[]>, required: true },
  /** The agent is still writing this reply. */
  running: Boolean,
  /** The reply's last UI takes answers (this is the conversation's latest reply); otherwise its controls are disabled. */
  uiActive: Boolean,
  /** The person's next message after this reply: the reply's last UI shows the choice that sent it as chosen. */
  answer: defineProp<string>(),
} as const;

/** A file the reply wrote or changed, for the `file` slot. */
export interface AgentMessageFile {
  /** The step's target: the file's path within the project. */
  path: string;
  /** A step writing it is running now. */
  running: boolean;
}

/** What the reply reports. */
export interface AgentMessageEvents {
  /** The person's answer through a generative UI, to send as their next message. Awaited: the control shows busy. */
  reply: [text: string];
}
</script>

<script lang="ts" setup>
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { useEmitAsync } from '@nzyme/vue-utils/useEmitAsync.js';
import { computed } from 'vue';

import type { ConversationStepPart } from '@piko/common/api/ConversationTypes.js';

import * as l from './AgentMessage.loc.js';
import AgentMark from './AgentMark.vue';
import GenerativeUi from './GenerativeUi.vue';
import RichText from './RichText.vue';
import Step from './Step.vue';
import StepList from './StepList.vue';
import StepsSummary from './StepsSummary.vue';
import { splitGenerativeUi } from './utils/splitGenerativeUi.js';

/** A run of the reply: Markdown, a generative UI, or the steps taken one after another. */
type Block =
  | { type: 'markdown'; text: string }
  | { type: 'ui'; source: string; complete: boolean }
  | { type: 'steps'; steps: ConversationStepPart[] };

const props = defineProps(AgentMessageProps);
defineEmits<AgentMessageEvents>();
defineSlots<{
  /** A file the reply wrote or changed, in the order of its first step: its chip. */
  file?(props: AgentMessageFile): unknown;
}>();

const emitAsync = useEmitAsync<AgentMessageEvents>();
const t = useTranslate();
const blocks = computed(() => (props.running ? toRunningBlocks(props.parts) : toFinishedBlocks(props.parts)));
// Earlier UIs of the reply were answered or passed over: only the last takes answers, or shows what answered it.
const lastUiIndex = computed(() => blocks.value.findLastIndex(block => block.type === 'ui'));
const steps = computed(() => props.parts.filter(part => part.type === 'step'));
const files = computed(() => toFiles(steps.value));

async function reply(text: string) {
  await emitAsync('reply', text);
}

/** The files of the reply's write and edit steps; a failed step's file may not exist, so it gives none. */
function toFiles(parts: readonly ConversationStepPart[]) {
  const result = new Map<string, AgentMessageFile>();
  for (const part of parts) {
    if (
      (part.kind !== 'writeFile' && part.kind !== 'editFile') ||
      part.target === undefined ||
      part.status === 'failed'
    ) {
      continue;
    }
    const running = part.status === 'running' || (result.get(part.target)?.running ?? false);
    result.set(part.target, { path: part.target, running });
  }
  return [...result.values()];
}

function toRunningBlocks(parts: readonly ConversationAgentPart[]) {
  const result: Block[] = [];
  let text = '';
  for (const part of parts) {
    if (part.type === 'text') {
      text += part.text;
      continue;
    }
    result.push(...toTextBlocks(text));
    text = '';
    const last = result.at(-1);
    if (last?.type === 'steps') {
      last.steps.push(part);
    } else {
      result.push({ type: 'steps', steps: [part] });
    }
  }
  result.push(...toTextBlocks(text));
  return result;
}

function toFinishedBlocks(parts: readonly ConversationAgentPart[]) {
  const text = parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('\n\n');
  return toTextBlocks(text);
}

function toTextBlocks(text: string): Block[] {
  if (text === '') {
    return [];
  }
  return splitGenerativeUi(text).map(segment =>
    segment.type === 'markdown'
      ? segment
      : { type: 'ui', source: segment.source, complete: segment.closed || !props.running },
  );
}
</script>

<template>
  <div :class="$style.agentMessage">
    <AgentMark :class="$style.agentMessage_mark" />
    <div :class="$style.agentMessage_body">
      <span :class="$style.agentMessage_author">{{ t(l.author) }}</span>
      <StepsSummary
        v-if="!props.running && steps.length"
        :count="steps.length"
      >
        <Step
          v-for="step in steps"
          :key="step.id"
          :kind="step.kind"
          :target="step.target"
          :status="step.status"
        />
      </StepsSummary>
      <template
        v-for="(block, index) in blocks"
        :key="index"
      >
        <RichText
          v-if="block.type === 'markdown'"
          :markdown="block.text"
          :caret="props.running && index === blocks.length - 1"
        />
        <GenerativeUi
          v-else-if="block.type === 'ui'"
          :source="block.source"
          :complete="block.complete"
          :active="props.uiActive && index === lastUiIndex"
          :answer="index === lastUiIndex ? props.answer : undefined"
          :answered="index !== lastUiIndex || props.answer !== undefined"
          @reply="reply"
        />
        <StepList v-else>
          <Step
            v-for="step in block.steps"
            :key="step.id"
            :kind="step.kind"
            :target="step.target"
            :status="step.status"
          />
        </StepList>
      </template>
      <RichText
        v-if="props.running && blocks.length === 0"
        markdown=""
        caret
      />
      <div
        v-if="$slots.file && files.length"
        :class="$style.agentMessage_files"
      >
        <template
          v-for="file in files"
          :key="file.path"
        >
          <slot
            name="file"
            v-bind="file"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<style lang="scss" module>
.agentMessage {
  display: flex;
  gap: $spacing-14;
  align-items: flex-start;
}

.agentMessage_mark {
  margin-top: -$spacing-02;
}

.agentMessage_body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: $spacing-16;
  min-width: 0;
  padding-top: $spacing-02;
}

.agentMessage_files {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-08;
}

.agentMessage_author {
  @include visually-hidden;
}
</style>
