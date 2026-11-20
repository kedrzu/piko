<!-- First run, step 2: choosing the AI account to connect (screen 45); either card opens its provider's sign-in page. -->

<script lang="ts" setup>
import { assertNever } from '@nzyme/utils/assertNever.js';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { useRouter } from 'nuxt/app';
import { computed, ref } from 'vue';

import type { AiProvider } from '@piko/common/api/AiTypes.js';
import ProviderCard from '@piko/ui/ProviderCard.vue';

import { openExternalUrl } from '@/utils/openExternalUrl.js';

import * as l from './ConnectAiPage.loc.js';
import { SetupStore } from './SetupStore.js';
import SetupShell from './SetupShell.vue';

const setup = useService(SetupStore);
const router = useRouter();
const t = useTranslate();

/** The provider whose sign-in could not be opened, when the last try failed. */
const failed = ref<AiProvider | null>(null);
const failedMessage = computed(() => {
  switch (failed.value) {
    case 'claude':
      return t(l.startFailedClaude);
    case 'chatgpt':
      return t(l.startFailedChatgpt);
    case null:
      return null;
    default:
      return assertNever(failed.value);
  }
});

async function connectClaude() {
  failed.value = null;
  try {
    await openExternalUrl(await setup.startLogin());
  } catch {
    failed.value = 'claude';
    return;
  }
  await router.push({ name: 'setupClaude' });
}

async function connectChatgpt() {
  failed.value = null;
  try {
    await openExternalUrl(await setup.startChatgptLogin());
  } catch {
    failed.value = 'chatgpt';
    return;
  }
  await router.push({ name: 'setupChatgpt' });
}
</script>

<template>
  <SetupShell
    step="ai"
    :title="t(l.title)"
    :body="t(l.body)"
  >
    <div :class="$style.connectAiPage_providers">
      <ProviderCard
        provider="claude"
        :name="t(l.claude)"
        :plans="t(l.claudePlans)"
        :connect-label="t(l.connectClaude)"
        @connect="connectClaude"
      />
      <ProviderCard
        provider="chatgpt"
        :name="t(l.chatgpt)"
        :plans="t(l.chatgptPlans)"
        :connect-label="t(l.connectChatgpt)"
        @connect="connectChatgpt"
      />
    </div>
    <p
      v-if="failedMessage"
      :class="$style.connectAiPage_error"
      role="alert"
    >
      {{ failedMessage }}
    </p>
  </SetupShell>
</template>

<style lang="scss" module>
.connectAiPage_providers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: $spacing-16;
}

.connectAiPage_error {
  margin: 0;
  color: $color-attention-ink;
  font-size: $font-size-body-s;
  line-height: $line-height-normal;
}
</style>
