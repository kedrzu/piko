<!-- The toast that offers a downloaded app update (`Toast`, pinned): ready, with Restart; restarting, with Restart busy and the × disabled; or, in warning, its install failed, with Try again. Nothing restarts until Restart is pressed; the × asks to put the offer off until the next launch. -->

<script lang="ts">
import type { PropType } from 'vue';

/** The update on offer: what `AppUpdate` says while an update is `ready`, `installing` or its install failed. */
export type UpdateToastOffer =
  | { readonly kind: 'ready'; readonly version: string }
  | { readonly kind: 'installing'; readonly version: string }
  | { readonly kind: 'installFailed'; readonly version: string };

export const UpdateToastProps = {
  offer: { type: Object as PropType<UpdateToastOffer>, required: true },
  /** The version running now. */
  currentVersion: { type: String, required: true },
} as const;
</script>

<script lang="ts" setup>
import { CircleArrowDown, RotateCw } from '@lucide/vue';
import Translate from '@nzyme/vue-i18n/Translate.vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { computed } from 'vue';

import Button from './Button.vue';
import Toast from './Toast.vue';
import * as l from './UpdateToast.loc.js';

const props = defineProps(UpdateToastProps);
const emit = defineEmits<{
  /** Restart, or Try again, was pressed: the only way the app restarts. */
  restart: [];
  /** The × was pressed: put the offer off until the next launch. */
  dismiss: [];
}>();

const t = useTranslate();
const failed = computed(() => props.offer.kind === 'installFailed');
const installing = computed(() => props.offer.kind === 'installing');

function onOpenChange(open: boolean) {
  if (!open) {
    emit('dismiss');
  }
}
</script>

<template>
  <!-- `open` is the consumer's: the offer going away is what hides the toast. -->
  <Toast
    :open="true"
    :title="t(failed ? l.failedTitle : l.readyTitle)"
    :tone="failed ? 'warning' : 'accent'"
    :icon="failed ? undefined : CircleArrowDown"
    lasts="pinned"
    :closable="!installing"
    @update:open="onOpenChange"
  >
    <Translate :t="failed ? l.failedDescription : l.readyDescription">
      <template #version>
        <span :class="$style.updateToast_version">{{ props.offer.version }}</span>
      </template>
      <template #current>
        <span :class="$style.updateToast_version">{{ props.currentVersion }}</span>
      </template>
    </Translate>
    <template #actions>
      <Button
        :icon="RotateCw"
        :busy="installing"
        @click="emit('restart')"
      >
        {{ t(installing ? l.restarting : failed ? l.retry : l.restart) }}
      </Button>
    </template>
  </Toast>
</template>

<style lang="scss" module>
.updateToast_version {
  white-space: nowrap;
}
</style>
