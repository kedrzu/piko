<!-- A conversation open (screens 56, 57, 59–61, 65–74): its messages with the agent's reply streaming and chips for the files it wrote, error lines, the banner when the agent cannot answer, and the composer with Stop; a file open beside it (`?file=`, frame 26) with Open as a tab and Close. -->

<script lang="ts" setup>
import { LogIn } from '@lucide/vue';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { useLanguage } from '@nzyme/vue-i18n/useLanguage.js';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { useLogger } from '@nzyme/vue-ioc/useLogger.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { useRoute, useRouter } from 'nuxt/app';
import { computed, ref, useTemplateRef, watch } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

import type { ConversationError } from '@poweragents/common/api/ConversationTypes.js';
import AgentMessage from '@poweragents/ui/AgentMessage.vue';
import Composer from '@poweragents/ui/Composer.vue';
import ConversationLayout from '@poweragents/ui/ConversationLayout.vue';
import FileChip from '@poweragents/ui/FileChip.vue';
import MessageError from '@poweragents/ui/MessageError.vue';
import SideView from '@poweragents/ui/SideView.vue';
import StatusBanner from '@poweragents/ui/StatusBanner.vue';
import UserMessage from '@poweragents/ui/UserMessage.vue';
import { splitGenerativeUi } from '@poweragents/ui/utils/splitGenerativeUi.js';

import * as l from './ConversationPage.loc.js';
import * as lc from './Conversations.loc.js';
import { FileAgentStore } from '@/files/FileAgentStore.js';
import { fileKind } from '@/files/fileKind.js';
import { fileTitle } from '@/files/fileTitle.js';
import ProjectFileView from '@/files/ProjectFileView.vue';
import { ProjectStore } from '@/projects/ProjectStore.js';
import { TabStore } from '@/tabs/TabStore.js';
import type { Tab } from '@/tabs/TabStore.js';

import { ConversationStore } from './ConversationStore.js';
import { useConversation } from './useConversation.js';

const route = useRoute();
const router = useRouter();
const store = useService(ConversationStore);
const projects = useService(ProjectStore);
const tabs = useService(TabStore);
const fileAgents = useService(FileAgentStore);
const t = useTranslate();
const language = useLanguage();
const logger = useLogger();

const projectId = computed(() => String(route.params['projectId']));
const conversationId = computed(() => String(route.params['conversationId']));
const conversation = useConversation({ projectId, conversationId });
const layout = useTemplateRef('layout');
const sideFileView = useTemplateRef('sideFileView');
/** What the person is writing. */
const message = ref('');

const title = computed(() => store.find(conversationId.value)?.title ?? t(lc.untitled));
const project = computed(() => projects.state.projects?.find(candidate => candidate.id === projectId.value));
/** The file open beside the conversation: its path in the project. */
const sideFile = computed(() => {
  const value = route.query['file'];
  return typeof value === 'string' && value !== '' ? value : undefined;
});
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
  () => project.value?.role === 'appSetup' && !conversation.items.some(item => item.type === 'user'),
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

/** Where a file's chip leads: the file's tab when it has one (one editor per file), else the side view. */
function fileRoute(path: string): RouteLocationRaw {
  const tab: Tab = { kind: 'file', projectId: projectId.value, path };
  const key = tabs.keyOf(tab);
  if (tabs.state.tabs.some(other => tabs.keyOf(other) === key)) {
    return tabs.routeOf(tab);
  }
  return {
    name: 'conversation',
    params: { projectId: projectId.value, conversationId: conversationId.value },
    query: { file: path },
  };
}

/** The agent writes the file now: a step of its reply runs, or the daemon says so. */
function isWriting(path: string, running: boolean) {
  return running || fileAgents.get(projectId.value, path)?.state === 'writing';
}

/** Moves the side view's file into its tab; what the person typed is saved first, so the tab opens with it. */
async function openSideFileAsTab(path: string) {
  await sideFileView.value?.flush();
  await router.push(tabs.routeOf({ kind: 'file', projectId: projectId.value, path }));
}

async function closeSideFile() {
  const path = sideFile.value;
  if (path !== undefined) {
    // A closed file holds the agent no longer: the person is done typing there.
    void fileAgents.release(projectId.value, path);
  }
  await router.push({
    name: 'conversation',
    params: { projectId: projectId.value, conversationId: conversationId.value },
  });
}

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
      >
        <template #file="file">
          <FileChip
            :title="fileTitle(file.path)"
            :kind="fileKind(file.path)"
            :place="project?.name"
            :writing="isWriting(file.path, file.running)"
            :to="fileRoute(file.path)"
          />
        </template>
      </AgentMessage>
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
    <template
      v-if="sideFile !== undefined"
      #aside
    >
      <SideView
        :title="fileTitle(sideFile)"
        :kind="fileKind(sideFile)"
        :place="project?.name"
        @open-as-tab="openSideFileAsTab(sideFile)"
        @close="closeSideFile"
      >
        <ProjectFileView
          ref="sideFileView"
          :project-id="projectId"
          :path="sideFile"
        />
      </SideView>
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
