<!-- Where toasts appear (reka-ui's `ToastProvider` and `ToastViewport`), the region "Notifications": the bottom-right corner of the app shell's card, the newest at the bottom. Put the `Toast`s inside it; F8 moves focus to them. -->

<script lang="ts" setup>
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { ToastProvider, ToastViewport } from 'reka-ui';

import * as l from './Toaster.loc.js';

defineSlots<{
  /** The `Toast`s, in the order they opened. */
  default?(): unknown;
}>();

const t = useTranslate();
</script>

<template>
  <ToastProvider
    :label="t(l.notification)"
    disable-swipe
  >
    <slot />
    <ToastViewport
      :class="$style.toaster"
      :label="t(l.notifications)"
    />
  </ToastProvider>
</template>

<style lang="scss" module>
$toaster-width: 360px;
// 24 px inside the app shell's card, which sits inside the window.
$toaster-inset: $spacing-shell-inset + $spacing-24;

.toaster {
  position: fixed;
  // Above the app's content, wherever the Toaster stands in the markup.
  z-index: 10;
  right: $toaster-inset;
  bottom: $toaster-inset;
  display: flex;
  flex-direction: column;
  gap: $spacing-08;
  width: min($toaster-width, calc(100vw - #{2 * $toaster-inset}));
  margin: 0;
  padding: 0;
  list-style: none;

  @include focus-ring; // F8 focuses the list itself
}
</style>
