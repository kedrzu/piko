<!-- A row of the open project's files in the sidebar, indented by its folders: a file (an icon by its type, a pencil while the agent writes in it, an hourglass while it waits to, a link, white when open) or a folder (a button that expands it in place). -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import type { PropType } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

import type { FileIconKind } from './utils/fileIcon.js';

/** What the row is, by its icon: a folder, or a file by its type. */
export type FileRowKind = 'folder' | FileIconKind;

export const FileRowProps = {
  label: { type: String, required: true },
  kind: { type: String as PropType<FileRowKind>, required: true },
  /** A file's screen; a folder has none. */
  to: defineProp<RouteLocationRaw>(),
  /** How many folders the entry sits in: one indentation step each. */
  depth: { type: Number, default: 0 },
  /** A folder's entries show under it. */
  expanded: Boolean,
  /** A file open now: white, a stronger label and `aria-current="page"`. */
  selected: Boolean,
  /** A file the agent is writing in now: a pencil in the brand colour instead of its type's icon. */
  writing: Boolean,
  /** A file the agent waits to change while the person types in it: an hourglass instead of its type's icon. */
  waiting: Boolean,
} as const;

export const FileRowEmits = {
  /** The person asked to expand or collapse the folder. */
  toggle: () => true,
};
</script>

<script lang="ts" setup>
import { Folder, FolderOpen, Hourglass, PencilLine } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import * as l from './FileRow.loc.js';
import { fileIcon } from './utils/fileIcon.js';

const props = defineProps(FileRowProps);
const emit = defineEmits(FileRowEmits);
const t = useTranslate();

const icon = computed(() => {
  if (props.waiting && props.kind !== 'folder') {
    return Hourglass;
  }
  if (props.writing && props.kind !== 'folder') {
    return PencilLine;
  }
  if (props.kind === 'folder') {
    return props.expanded ? FolderOpen : Folder;
  }
  return fileIcon(props.kind);
});
const indent = computed(() => ({ '--file-row-depth': props.depth }));
</script>

<template>
  <button
    v-if="props.kind === 'folder'"
    type="button"
    :class="$style.fileRow"
    :style="indent"
    :aria-expanded="props.expanded"
    @click="emit('toggle')"
  >
    <component
      :is="icon"
      :class="$style.fileRow_icon"
      aria-hidden="true"
    />
    <span :class="$style.fileRow_label">{{ props.label }}</span>
  </button>
  <RouterLink
    v-else-if="props.to"
    :to="props.to"
    :class="[$style.fileRow, props.selected && $style.fileRow_selected]"
    :style="indent"
    :aria-current="props.selected ? 'page' : undefined"
  >
    <component
      :is="icon"
      :class="[
        $style.fileRow_icon,
        props.waiting ? $style.fileRow_icon_waiting : props.writing && $style.fileRow_icon_writing,
      ]"
      aria-hidden="true"
    />
    <span :class="$style.fileRow_label">
      {{ props.label }}
      <span
        v-if="props.waiting"
        :class="$style.fileRow_status"
        >, {{ t(l.agentWaiting) }}</span
      >
      <span
        v-else-if="props.writing"
        :class="$style.fileRow_status"
        >, {{ t(l.agentWriting) }}</span
      >
    </span>
  </RouterLink>
</template>

<style lang="scss" module>
.fileRow {
  @include sidebar-row;

  width: 100%;
  padding-left: calc(#{$spacing-10} + var(--file-row-depth, 0) * #{$spacing-16});
  border: 0;
  background: none;
  font-family: inherit;
  text-align: start;
  cursor: pointer;
}

.fileRow_selected {
  @include sidebar-row-selected;
}

.fileRow_icon {
  flex: none;
  width: 14px;
  height: 14px;
  color: $color-ink-muted;
}

.fileRow_icon_writing {
  color: $color-brand-1-strong;
}

.fileRow_icon_waiting {
  color: $color-link-ink;
}

.fileRow_status {
  @include visually-hidden;
}

.fileRow_label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
