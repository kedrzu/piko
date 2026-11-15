<!-- A file the agent wrote, under its reply's text: its icon by type, its name, where it is (or "writing…" in the brand colour while the agent writes it) and a mark that it opens beside the conversation; a link. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import type { PropType } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

import type { FileIconKind } from './utils/fileIcon.js';

export const FileChipProps = {
  /** The file's name as the person knows it (a note without its extension). */
  title: { type: String, required: true },
  kind: { type: String as PropType<FileIconKind>, required: true },
  /** Where the file is: its project's name. */
  place: defineProp<string>(),
  /** The agent is writing the file now: "writing…" instead of where it is. */
  writing: Boolean,
  /** What opens it: the side view, or the file's tab when it has one. */
  to: { type: [String, Object] as PropType<RouteLocationRaw>, required: true },
} as const;
</script>

<script lang="ts" setup>
import { PanelRightOpen } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import * as l from './FileChip.loc.js';
import { fileIcon } from './utils/fileIcon.js';

const props = defineProps(FileChipProps);
const t = useTranslate();

const icon = computed(() => fileIcon(props.kind));
</script>

<template>
  <RouterLink
    :to="props.to"
    :class="$style.fileChip"
  >
    <!-- Named by what it shows, so a voice command saying the visible text finds it; this says what it does. -->
    <span :class="$style.fileChip_hidden">{{ t(l.openBeside) }}</span>
    <component
      :is="icon"
      :class="$style.fileChip_icon"
      aria-hidden="true"
    />
    <span :class="$style.fileChip_name">{{ props.title }}</span>
    <span
      v-if="props.writing"
      :class="[$style.fileChip_meta, $style.fileChip_writing]"
    >
      {{ t(l.writing) }}
    </span>
    <span
      v-else-if="props.place"
      :class="$style.fileChip_meta"
    >
      {{ props.place }}
    </span>
    <PanelRightOpen
      :class="$style.fileChip_open"
      aria-hidden="true"
    />
  </RouterLink>
</template>

<style lang="scss" module>
.fileChip {
  display: inline-flex;
  gap: $spacing-08;
  align-items: center;
  align-self: flex-start;
  max-width: 100%;
  padding: $spacing-08 $spacing-12 $spacing-08 $spacing-10;
  border: 1px solid $color-border;
  border-radius: $radius-m;
  background: $color-surface;
  color: $color-ink;
  text-decoration: none;
  transition: background-color $duration-fast;

  @include focus-ring;

  @include hover {
    background: $color-surface-soft;
  }
}

.fileChip_icon {
  flex: none;
  width: 15px;
  height: 15px;
  color: $color-ink-muted;
}

.fileChip_name {
  min-width: 0;
  overflow: hidden;
  font-size: $font-size-control;
  font-weight: $font-weight-semibold;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fileChip_meta {
  flex: none;
  color: $color-ink-muted;
  font-size: $font-size-badge;
}

.fileChip_writing {
  color: $color-brand-1-strong;
}

.fileChip_hidden {
  @include visually-hidden;
}

.fileChip_open {
  flex: none;
  width: 14px;
  height: 14px;
  color: $color-ink-faint;
}
</style>
