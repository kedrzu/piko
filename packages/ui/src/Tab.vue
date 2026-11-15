<!-- A tab in the main area's tab bar: a link to its screen with an icon by kind (a conversation's speech bubble in its project's colour, or a spinner while the agent works; Memory's brain; a file's icon by type) and its title; the active one filled, with a × to close it. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import type { PropType } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

import type { ProjectColor } from './ProjectColor.js';

/** What the tab shows, by its icon: a conversation, Memory, or a file by its type. */
export type TabIcon = 'conversation' | 'memory' | 'note' | 'spreadsheet' | 'image' | 'file';

export const TabProps = {
  title: { type: String, required: true },
  /** The tab's screen. */
  to: { type: [String, Object] as PropType<RouteLocationRaw>, required: true },
  icon: { type: String as PropType<TabIcon>, required: true },
  /** The icon's colour: a conversation's project's; Memory is violet. A file's icon has none. */
  color: defineProp<ProjectColor>(),
  /** The agent is working on the conversation: a spinner in place of the icon. */
  running: Boolean,
  /** The tab's screen shows now: filled, `aria-current="page"`, with its ×. */
  active: Boolean,
} as const;

export const TabEmits = {
  /** The person asked to close the tab. */
  close: () => true,
};
</script>

<script lang="ts" setup>
import { Brain, File, FileText, Image, MessageCircle, Sheet, X } from '@lucide/vue';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import Spinner from './Spinner.vue';
import * as l from './Tab.loc.js';

const props = defineProps(TabProps);
const emit = defineEmits(TabEmits);

const t = useTranslate();
const iconComponent = computed(() => {
  switch (props.icon) {
    case 'conversation':
      return MessageCircle;
    case 'memory':
      return Brain;
    case 'note':
      return FileText;
    case 'spreadsheet':
      return Sheet;
    case 'image':
      return Image;
    case 'file':
      return File;
    default:
      return assertNever(props.icon);
  }
});
</script>

<template>
  <span :class="[$style.tab, props.active && $style.tab_active, props.color && $style[`tab_${props.color}`]]">
    <RouterLink
      :to="props.to"
      :class="$style.tab_link"
      :aria-current="props.active ? 'page' : undefined"
    >
      <Spinner
        v-if="props.running"
        :class="$style.tab_spinner"
        :label="t(l.running)"
      />
      <component
        :is="iconComponent"
        v-else
        :class="$style.tab_icon"
        aria-hidden="true"
      />
      <span :class="$style.tab_title">{{ props.title }}</span>
    </RouterLink>
    <button
      v-if="props.active"
      type="button"
      :class="$style.tab_close"
      :aria-label="t(l.close, { title: props.title })"
      @click="emit('close')"
    >
      <X
        :class="$style.tab_closeIcon"
        aria-hidden="true"
      />
    </button>
  </span>
</template>

<style lang="scss" module>
@include project-color-modifiers(tab);

.tab {
  --project-color: #{$color-ink-muted};

  display: inline-flex;
  flex: none;
  align-items: center;
  max-width: 240px;
  border-radius: $radius-s;
  color: $color-ink-muted;
  transition: background-color $duration-fast;

  @include hover {
    background: $color-surface-soft;
  }
}

.tab_active {
  background: $color-surface-soft;
  color: $color-ink;
}

.tab_link {
  display: flex;
  flex: 1;
  gap: $spacing-08;
  align-items: center;
  min-width: 0;
  min-height: 32px;
  padding: $spacing-06 $spacing-12;
  border-radius: $radius-s;
  color: inherit;
  font-size: $font-size-control;
  font-weight: $font-weight-semibold;
  line-height: $line-height-snug;
  text-decoration: none;

  @include focus-ring;
}

.tab_active .tab_link {
  padding-right: $spacing-04;
}

.tab_icon {
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--project-color);
}

.tab_spinner {
  font-size: $font-size-body-s; // 14px
}

.tab_title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab_close {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-right: $spacing-04;
  padding: 0;
  border: none;
  border-radius: $radius-pill;
  background: transparent;
  color: $color-ink-muted;
  cursor: pointer;

  @include focus-ring;
  @include hover {
    background: $color-border;
    color: $color-ink;
  }
}

.tab_closeIcon {
  width: 14px;
  height: 14px;
}
</style>
