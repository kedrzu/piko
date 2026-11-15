<!-- A file open beside the conversation (frame 26): a bar with its icon, its name, where it is, Open as a tab and Close, over the file's view. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import type { PropType } from 'vue';

import type { FileIconKind } from './utils/fileIcon.js';

export const SideViewProps = {
  /** The file's name as the person knows it (a note without its extension). */
  title: { type: String, required: true },
  kind: { type: String as PropType<FileIconKind>, required: true },
  /** Where the file is: its project's name. */
  place: defineProp<string>(),
} as const;

export const SideViewEmits = {
  /** The person asked to move the file into its own tab. The button stays busy while an async listener runs. */
  openAsTab: () => true,
  /** The person closed the side view. */
  close: () => true,
};
</script>

<script lang="ts" setup>
import { Maximize2, X } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { useEmitAsync } from '@nzyme/vue-utils/useEmitAsync.js';
import { computed } from 'vue';

import Button from './Button.vue';
import * as l from './SideView.loc.js';
import { fileIcon } from './utils/fileIcon.js';

const props = defineProps(SideViewProps);
const emit = defineEmits(SideViewEmits);
defineSlots<{
  /** The file's view: its banners and the editor or the preview. */
  default(): unknown;
}>();

const t = useTranslate();
const emitAsync = useEmitAsync(SideViewEmits);
const icon = computed(() => fileIcon(props.kind));

function openAsTab() {
  return emitAsync('openAsTab');
}
</script>

<template>
  <div :class="$style.sideView">
    <div :class="$style.sideView_bar">
      <component
        :is="icon"
        :class="$style.sideView_icon"
        aria-hidden="true"
      />
      <span :class="$style.sideView_name">{{ props.title }}</span>
      <span
        v-if="props.place"
        :class="$style.sideView_place"
      >
        {{ props.place }}
      </span>
      <span :class="$style.sideView_spacer" />
      <Button
        variant="secondary"
        :icon="Maximize2"
        @click="openAsTab"
      >
        {{ t(l.openAsTab) }}
      </Button>
      <Button
        variant="ghost"
        :icon="X"
        @click="emit('close')"
      >
        <span :class="$style.sideView_hidden">{{ t(l.close) }}</span>
      </Button>
    </div>
    <slot />
  </div>
</template>

<style lang="scss" module>
.sideView {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.sideView_bar {
  display: flex;
  flex: none;
  gap: $spacing-08;
  align-items: center;
  padding: $spacing-18 $spacing-28 0;
}

.sideView_icon {
  flex: none;
  width: 15px;
  height: 15px;
  color: $color-ink-muted;
}

.sideView_name {
  min-width: 0;
  overflow: hidden;
  color: $color-ink;
  font-size: $font-size-body-s;
  font-weight: $font-weight-semibold;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sideView_place {
  flex: none;
  color: $color-ink-muted;
  font-size: $font-size-control;
}

.sideView_spacer {
  flex: 1;
}

.sideView_hidden {
  @include visually-hidden;
}
</style>
