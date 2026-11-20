<!-- First run, step 2: waiting while the person signs in to ChatGPT in the browser (screen 38 without the code field), and a sign-in that failed or expired. -->

<script lang="ts" setup>
import { ArrowLeft, ExternalLink, RefreshCw } from '@lucide/vue';
import { HttpError } from '@nzyme/fetch-utils/HttpError.js';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { useLogger } from '@nzyme/vue-ioc/useLogger.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { useRouter } from 'nuxt/app';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import Button from '@piko/ui/Button.vue';
import ErrorNotice from '@piko/ui/ErrorNotice.vue';
import Spinner from '@piko/ui/Spinner.vue';

import { openExternalUrl } from '@/utils/openExternalUrl.js';

import * as l from './ChatgptPage.loc.js';
import { SetupStore } from './SetupStore.js';
import SetupShell from './SetupShell.vue';

/** How often the sign-in's state is asked for while the person signs in, in ms. */
const POLL_INTERVAL_MS = 1000;

const setup = useService(SetupStore);
const router = useRouter();
const t = useTranslate();
const logger = useLogger();

/**
 * Where the sign-in stands on this screen. Without a sign-in waiting (say, after an app restart) it counts as expired:
 * the daemon would answer so, and the person starts a new one.
 */
const state = ref<'pending' | 'failed' | 'expired'>(setup.state.chatgptLoginUrl == null ? 'expired' : 'pending');
/** The daemon could not tell where the sign-in stands; asking stops until the person asks again. */
const pollFailed = ref(false);
/** A new sign-in could not be started or its page opened. */
const startFailed = ref(false);
const failure = computed(() => {
  switch (state.value) {
    case 'failed':
      return { title: t(l.failedTitle), body: t(l.failedBody) };
    case 'expired':
      return { title: t(l.expiredTitle), body: t(l.expiredBody) };
    case 'pending':
      return null;
    default:
      return assertNever(state.value);
  }
});
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let mounted = false;

onMounted(() => {
  mounted = true;
  if (state.value === 'pending') {
    schedulePoll();
  }
});

onBeforeUnmount(() => {
  mounted = false;
  clearTimeout(pollTimer);
});

/** Reopens the waiting sign-in's page: never a new sign-in, which would end the one the person may be finishing. */
async function openAgain() {
  const url = setup.state.chatgptLoginUrl;
  if (url != null) {
    await openExternalUrl(url);
  }
}

/** Starts a new sign-in after one that failed or expired, and opens its page. */
async function restart() {
  startFailed.value = false;
  try {
    await openExternalUrl(await setup.startChatgptLogin());
  } catch {
    startFailed.value = true;
    return;
  }
  state.value = 'pending';
  pollFailed.value = false;
  schedulePoll();
}

async function checkAgain() {
  pollFailed.value = false;
  await poll();
}

/** Ends the waiting sign-in, so its port does not stay open, and goes back to the provider choice. */
async function back() {
  try {
    await setup.cancelChatgptLogin();
  } catch (error) {
    // The daemon ends a waiting sign-in by itself after a while; the person is not held here for it.
    logger.warn('ChatGPT sign-in could not be cancelled', { error });
  }
  await router.push({ name: 'setupAi' });
}

function schedulePoll() {
  clearTimeout(pollTimer);
  if (mounted) {
    pollTimer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
  }
}

async function poll() {
  try {
    const result = await setup.getChatgptLoginState();
    if (!mounted) {
      return;
    }
    switch (result.state) {
      case 'pending':
        break;
      case 'connected':
        await router.push({ name: 'setupDone' });
        return;
      case 'failed':
      case 'expired':
        state.value = result.state;
        return;
      default:
        assertNever(result);
    }
  } catch (error) {
    // A 409: the sandbox stopped being ready, and the app moves to the environment screen by itself.
    if (!(error instanceof HttpError && error.status === 409)) {
      logger.warn('ChatGPT sign-in state could not be read', { error });
      pollFailed.value = true;
      return;
    }
  }
  schedulePoll();
}
</script>

<template>
  <SetupShell
    step="ai"
    :title="t(l.title)"
    :body="t(l.body)"
  >
    <ErrorNotice
      v-if="failure"
      :title="failure.title"
      :body="failure.body"
    />
    <p
      v-else-if="!pollFailed"
      :class="$style.chatgptPage_waiting"
      role="status"
    >
      <Spinner />
      {{ t(l.waiting) }}
    </p>
    <p
      v-if="pollFailed"
      :class="$style.chatgptPage_error"
      role="alert"
    >
      {{ t(l.pollFailed) }}
    </p>
    <p
      v-if="startFailed"
      :class="$style.chatgptPage_error"
      role="alert"
    >
      {{ t(l.startFailed) }}
    </p>
    <template #back>
      <Button
        variant="ghost"
        :icon="ArrowLeft"
        @click="back"
      >
        {{ t(l.back) }}
      </Button>
    </template>
    <template #actions>
      <template v-if="state === 'pending'">
        <Button
          variant="secondary"
          :icon="ExternalLink"
          @click="openAgain"
        >
          {{ t(l.openAgain) }}
        </Button>
        <Button
          v-if="pollFailed"
          :icon="RefreshCw"
          @click="checkAgain"
        >
          {{ t(l.checkAgain) }}
        </Button>
      </template>
      <Button
        v-else
        :icon="RefreshCw"
        @click="restart"
      >
        {{ state === 'failed' ? t(l.retry) : t(l.startOver) }}
      </Button>
    </template>
  </SetupShell>
</template>

<style lang="scss" module>
.chatgptPage_waiting {
  display: flex;
  gap: $spacing-08;
  align-items: center;
  margin: 0;
  color: $color-ink-body;
  font-size: $font-size-body-s;
  line-height: $line-height-normal;
}

.chatgptPage_error {
  margin: 0;
  color: $color-attention-ink;
  font-size: $font-size-body-s;
  line-height: $line-height-normal;
}
</style>
