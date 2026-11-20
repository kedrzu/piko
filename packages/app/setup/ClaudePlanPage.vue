<!-- First run, step 2: signed in to Claude with a plan the agent cannot use (screen 40); another account, or Claude's plans. -->

<script lang="ts" setup>
import { ArrowLeft, ExternalLink, LogIn } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { useRouter } from 'nuxt/app';
import { computed, ref } from 'vue';

import AccountCard from '@piko/ui/AccountCard.vue';
import Button from '@piko/ui/Button.vue';
import CheckList from '@piko/ui/CheckList.vue';

import { openExternalUrl } from '@/utils/openExternalUrl.js';

import * as l from './ClaudePlanPage.loc.js';
import { SetupStore } from './SetupStore.js';
import SetupShell from './SetupShell.vue';

/** Claude's page of plans, where the person can buy one the agent works with. */
const CLAUDE_PLANS_URL = 'https://claude.com/pricing';

const setup = useService(SetupStore);
const router = useRouter();
const t = useTranslate();

const failed = ref(false);
/** The Claude account's email: the sign-in just ended here, or the connected account after an app restart. */
const email = computed(() => {
  const account = setup.state.signIn ?? (setup.state.ai?.connected ? setup.state.ai : null);
  return account?.provider === 'claude' ? (account.email ?? undefined) : undefined;
});

async function showPlans() {
  await openExternalUrl(CLAUDE_PLANS_URL);
}

async function signInAgain() {
  failed.value = false;
  try {
    await openExternalUrl(await setup.startLogin());
  } catch {
    failed.value = true;
    return;
  }
  await router.push({ name: 'setupClaude' });
}

async function back() {
  await router.push({ name: 'setupAi' });
}
</script>

<template>
  <SetupShell
    step="ai"
    :title="t(l.title)"
    :body="t(l.body)"
  >
    <AccountCard
      provider="claude"
      :name="t(l.claude)"
      :email="email"
    />
    <CheckList
      :label="t(l.plansLabel)"
      :items="[t(l.planPro), t(l.planMax)]"
    />
    <p :class="$style.claudePlanPage_hint">
      {{ t(l.hint) }}
    </p>
    <p
      v-if="failed"
      :class="$style.claudePlanPage_error"
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
      <Button
        variant="secondary"
        :icon="ExternalLink"
        @click="showPlans"
      >
        {{ t(l.showPlans) }}
      </Button>
      <Button
        :icon="LogIn"
        @click="signInAgain"
      >
        {{ t(l.signInAgain) }}
      </Button>
    </template>
  </SetupShell>
</template>

<style lang="scss" module>
.claudePlanPage_hint {
  margin: 0;
  color: $color-ink-body;
  font-size: $font-size-body-s;
  line-height: $line-height-normal;
}

.claudePlanPage_error {
  margin: 0;
  color: $color-attention-ink;
  font-size: $font-size-body-s;
  line-height: $line-height-normal;
}
</style>
