<!-- First run, done: Claude or ChatGPT is connected (screen 41); on to the app. -->

<script lang="ts" setup>
import { ArrowRight } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { useRouter } from 'nuxt/app';
import { computed } from 'vue';

import AccountCard from '@poweragents/ui/AccountCard.vue';
import Button from '@poweragents/ui/Button.vue';

import * as l from './SetupDonePage.loc.js';
import { SetupStore } from './SetupStore.js';
import SetupShell from './SetupShell.vue';

const setup = useService(SetupStore);
const router = useRouter();
const t = useTranslate();

/** The account just signed in, or the connected one after an app restart; the guard lets this screen show only then. */
const account = computed(() => {
  const signIn = setup.state.signIn;
  if (signIn != null) {
    return signIn;
  }
  const ai = setup.state.ai;
  return ai?.connected ? ai : null;
});
const providerName = computed(() => (account.value ? t(l[account.value.provider]) : ''));

async function openApp() {
  await router.push({ name: 'home' });
}
</script>

<template>
  <SetupShell
    step="done"
    :title="t(l.title, { provider: providerName })"
  >
    <AccountCard
      v-if="account"
      :provider="account.provider"
      :name="providerName"
      :email="account.email ?? undefined"
      connected
    />
    <p :class="$style.setupDonePage_next">
      {{ t(l.next) }}
    </p>
    <template #actions>
      <Button
        :icon="ArrowRight"
        @click="openApp"
      >
        {{ t(l.openApp) }}
      </Button>
    </template>
  </SetupShell>
</template>

<style lang="scss" module>
.setupDonePage_next {
  margin: 0;
  color: $color-ink-body;
  font-size: $font-size-lead;
  line-height: $line-height-relaxed;
}
</style>
