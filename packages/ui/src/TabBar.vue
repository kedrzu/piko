<!-- The main area's tab bar: the open tabs in a row, the active one filled with its × to close it; scrolls sideways when they do not fit. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import type { PropType } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

import type { ProjectColor } from './ProjectColor.js';
import type { TabIcon } from './Tab.vue';

/** A tab as the bar shows it. */
export interface TabBarItem {
  /** Unique among the tabs; `close` reports it. */
  id: string;
  title: string;
  /** The tab's screen. */
  to: RouteLocationRaw;
  icon: TabIcon;
  /** The icon's colour; a file's icon has none. */
  color?: ProjectColor;
  /** The agent is working on the conversation. */
  running?: boolean;
}

export const TabBarProps = {
  /** In the order they show. */
  tabs: { type: Array as PropType<readonly TabBarItem[]>, required: true },
  /** The id of the tab whose screen shows now. */
  activeId: defineProp<string>(),
} as const;

export const TabBarEmits = {
  /** The person asked to close the tab with this id. */
  close: (_id: string) => true,
};
</script>

<script lang="ts" setup>
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';

import Tab from './Tab.vue';
import * as l from './TabBar.loc.js';

const props = defineProps(TabBarProps);
const emit = defineEmits(TabBarEmits);

const t = useTranslate();
</script>

<template>
  <nav
    :class="$style.tabBar"
    :aria-label="t(l.label)"
  >
    <ul :class="$style.tabBar_list">
      <li
        v-for="tab in props.tabs"
        :key="tab.id"
        :class="$style.tabBar_item"
      >
        <Tab
          :title="tab.title"
          :to="tab.to"
          :icon="tab.icon"
          :color="tab.color"
          :running="tab.running"
          :active="tab.id === props.activeId"
          @close="emit('close', tab.id)"
        />
      </li>
    </ul>
  </nav>
</template>

<style lang="scss" module>
.tabBar {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}

.tabBar_list {
  display: flex;
  gap: $spacing-04;
  align-items: center;
  margin: 0;
  // Room for the focus ring, which the sideways scroll would clip.
  padding: $spacing-10 $spacing-04;
  list-style: none;
}

.tabBar_item {
  display: flex;
  flex: none;
}
</style>
