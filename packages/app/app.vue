<script lang="ts" setup>
import { NuxtLayout, NuxtPage } from '#components';
import { useLanguage } from '@nzyme/vue-i18n/useLanguage.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { ConfigProvider } from 'reka-ui';

import Toaster from '@piko/ui/Toaster.vue';
import UpdateToast from '@piko/ui/UpdateToast.vue';

import { AppUpdate } from '@/updates/AppUpdate.js';

import '@piko/ui/styles/main.scss';

const language = useLanguage();
const update = useService(AppUpdate);
</script>

<template>
  <ConfigProvider
    :locale="language"
    dir="ltr"
    :scroll-body="false"
  >
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <!-- After the layout, so the toasts sit above the app's content. -->
    <Toaster>
      <UpdateToast
        v-if="update.offer && update.state"
        :offer="update.offer"
        :current-version="update.state.version"
        @restart="update.restart()"
        @dismiss="update.later()"
      />
    </Toaster>
  </ConfigProvider>
</template>
