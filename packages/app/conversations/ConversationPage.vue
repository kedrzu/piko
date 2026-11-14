<!-- A conversation open (screens 56, 57, 59–61, 65–74): its messages with the agent's reply streaming, error lines, the banner when the agent cannot answer, and the composer with Stop. -->

<script lang="ts" setup>
import { LogIn } from '@lucide/vue';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { useLanguage } from '@nzyme/vue-i18n/useLanguage.js';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { useLogger } from '@nzyme/vue-ioc/useLogger.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { useRoute, useRouter } from 'nuxt/app';
import { computed, ref, useTemplateRef, watch } from 'vue';

import type { ConversationError } from '@poweragents/common/api/ConversationTypes.js';
import AgentMessage from '@poweragents/ui/AgentMessage.vue';
import Composer from '@poweragents/ui/Composer.vue';
import ConversationLayout from '@poweragents/ui/ConversationLayout.vue';
import MessageError from '@poweragents/ui/MessageError.vue';
import StatusBanner from '@poweragents/ui/StatusBanner.vue';
import UserMessage from '@poweragents/ui/UserMessage.vue';
import { splitGenerativeUi } from '@poweragents/ui/utils/splitGenerativeUi.js';

import * as l from './ConversationPage.loc.js';
import * as lc from './Conversations.loc.js';
import { ProjectStore } from '@/projects/ProjectStore.js';

import { ConversationStore } from './ConversationStore.js';
import { useConversation } from './useConversation.js';

const route = useRoute();
const router = useRouter();
const store = useService(ConversationStore);
const projects = useService(ProjectStore);
const t = useTranslate();
const language = useLanguage();
const logger = useLogger();

const projectId = computed(() => String(route.params['projectId']));
const conversationId = computed(() => String(route.params['conversationId']));
const conversation = useConversation({ projectId, conversationId });
const layout = useTemplateRef('layout');
/** What the person is writing. */
const message = ref('');

const title = computed(() => store.find(conversationId.value)?.title ?? t(lc.untitled));
/** The name of the provider the conversation runs on, for the texts about its errors; `null` when the app knows none. */
const providerName = computed(() => {
  const provider = store.find(conversationId.value)?.provider;
  return provider ? t(l[provider]) : null;
});
const signedOutTitle = computed(() =>
  providerName.value ? t(l.signedOutTitle, { provider: providerName.value }) : t(l.signedOutTitleGeneric),
);
const usageLimitTitle = computed(() =>
  providerName.value ? t(l.usageLimitTitle, { provider: providerName.value }) : t(l.usageLimitTitleGeneric),
);
const lastItemKey = computed(() => conversation.items.at(-1)?.key);
/**
 * The key of the reply whose UI takes answers: the latest reply, once the agent is done and the person has not said
 * anything since (a message just sent or waiting in the queue counts; a failed run's error does not).
 */
const activeUiKey = computed(() => {
  if (conversation.running) {
    return undefined;
  }
  const lastAgentIndex = conversation.items.findLastIndex(item => item.type === 'agent');
  const answered = conversation.items.slice(lastAgentIndex + 1).some(item => item.type === 'user');
  return answered ? undefined : conversation.items[lastAgentIndex]?.key;
});
/** Whether the reply that takes answers has a UI to answer: the composer then offers typing as the other way. */
const uiWaiting = computed(() => {
  const item = conversation.items.find(candidate => candidate.key === activeUiKey.value);
  if (item?.type !== 'agent') {
    return false;
  }
  // Joined as `AgentMessage` joins a finished reply's text.
  const text = item.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('\n\n');
  return splitGenerativeUi(text).some(segment => segment.type === 'ui');
});
/** Each reply's answer: the text of the first message the person sent after it, keyed by the reply's key. */
const answers = computed(() => {
  const result = new Map<string, string>();
  let next: string | undefined;
  for (const item of conversation.items.toReversed()) {
    if (item.type === 'user') {
      next = item.text;
    } else if (item.type === 'agent' && next !== undefined) {
      result.set(item.key, next);
    }
  }
  return result;
});
/** App setup before the person has said anything: the agent has just asked about them (screen 65). */
const introducing = computed(
  () =>
    projects.state.projects?.find(project => project.id === projectId.value)?.role === 'appSetup' &&
    !conversation.items.some(item => item.type === 'user'),
);
const placeholder = computed(() => {
  if (conversation.running) {
    return t(l.placeholderRunning);
  }
  if (uiWaiting.value) {
    return t(l.placeholderUi);
  }
  return introducing.value ? t(l.placeholderIntroduce) : t(l.placeholder);
});

watch(
  () => conversation.notFound,
  notFound => {
    if (notFound) {
      void router.replace({ name: 'project', params: { projectId: projectId.value } });
    }
  },
);

/** Sends what the person typed; a failure puts it back in the composer. */
async function send(text: string) {
  message.value = '';
  if (!(await deliver(text))) {
    message.value = text;
  }
}

/** Whether the message was sent (or queued). A generative UI's answer goes through it too, the composer untouched. */
async function deliver(text: string) {
  layout.value?.scrollToEnd();
  try {
    await conversation.send(text);
    return true;
  } catch (error) {
    logger.warn('Message could not be sent', { conversationId: conversationId.value, error });
    return false;
  }
}

/** Sends the unanswered message again. */
async function retry(text: string | undefined) {
  if (text !== undefined) {
    await send(text);
  }
}

async function stop() {
  const withdrawn = await conversation.stop();
  if (withdrawn.length > 0) {
    // A message waiting for the agent's step is not delivered after a stop: it returns here, ahead of anything typed since.
    message.value = [...withdrawn, message.value].filter(text => text.length > 0).join(' ');
  }
}

function describeError(error: ConversationError) {
  switch (error.kind) {
    case 'signedOut':
      return providerName.value ? t(l.errorSignedOut, { provider: providerName.value }) : t(l.errorSignedOutGeneric);
    case 'usageLimit':
      return providerName.value ? t(l.errorUsageLimit, { provider: providerName.value }) : t(l.errorUsageLimitGeneric);
    case 'other':
      return providerName.value ? t(l.errorOther, { provider: providerName.value }) : t(l.errorOtherGeneric);
    default:
      return assertNever(error);
  }
}

function describeReset(resetAt: number | undefined) {
  if (resetAt == null) {
    return providerName.value
      ? t(l.usageLimitBodyUnknown, { provider: providerName.value })
      : t(l.usageLimitBodyUnknownGeneric);
  }
  const when = new Date(resetAt);
  return t(l.usageLimitBody, {
    date: when.toLocaleDateString(language.value, { day: 'numeric', month: 'long' }),
    time: when.toLocaleTimeString(language.value, { hour: '2-digit', minute: '2-digit' }),
  });
}
</script>

<template>
  <ConversationLayout
    ref="layout"
    @reach-top="conversation.loadOlder()"
  >
    <h1 :class="$style.conversationPage_title">
      {{ title }}
    </h1>
    <template
      v-for="item in conversation.items"
      :key="item.key"
    >
      <UserMessage
        v-if="item.type === 'user'"
        :text="item.text"
      />
      <AgentMessage
        v-else-if="item.type === 'agent'"
        :parts="item.parts"
        :running="item.running"
        :ui-active="item.key === activeUiKey"
        :answer="answers.get(item.key)"
        @reply="deliver"
      />
      <MessageError
        v-else
        :class="$style.conversationPage_error"
        :text="describeError(item.error)"
        :retryable="item.key === lastItemKey && conversation.retryable"
        @retry="retry(item.retryText)"
      />
    </template>
    <template #footer>
      <StatusBanner
        v-if="conversation.blockingError?.kind === 'signedOut'"
        :title="signedOutTitle"
        :body="t(l.signedOutBody)"
        :action-label="t(l.signIn)"
        :action-icon="LogIn"
        @action="router.push({ name: 'setupAi' })"
      />
      <StatusBanner
        v-else-if="conversation.blockingError?.kind === 'usageLimit'"
        :title="usageLimitTitle"
        :body="describeReset(conversation.blockingError.resetAt)"
      />
      <Composer
        v-model="message"
        :placeholder="placeholder"
        :running="conversation.running"
        @send="send"
        @stop="stop"
      />
    </template>
  </ConversationLayout>
</template>

<style lang="scss" module>
.conversationPage_title {
  @include visually-hidden;
}

.conversationPage_error {
  // Under the message it belongs to, closer than the gap between messages.
  margin-top: -$spacing-14;
}
</style>
