<!-- The app's sidebar: a New project button in the window bar, Memory and Schedules (with how many there are), then the projects (each with its mark: App setup's pin, a new project's sparkles), the open one with its Conversations (New conversation first, All conversations last) and its Files (a tree whose folders expand in place) under it, or a line saying there are none. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import type { PropType } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

import type { FileRowKind } from './FileRow.vue';
import type { ProjectColor } from './ProjectColor.js';
import type { ProjectRowMark } from './ProjectRow.vue';

/** A project as the sidebar lists it. */
export interface ProjectSidebarItem {
  id: string;
  name: string;
  color: ProjectColor;
  /** The project's screen, where a new conversation starts. */
  to: RouteLocationRaw;
  /** Shown at the row's end while the agent does not work in it. */
  mark?: ProjectRowMark;
}

/** A conversation of the open project as the sidebar lists it. */
export interface ProjectSidebarConversation {
  id: string;
  title: string;
  /** The conversation's screen. */
  to: RouteLocationRaw;
  /** The agent is working on it. */
  running: boolean;
  /** A schedule started it: its calendar after the title. */
  scheduled?: boolean;
}

/** A line of the open project's file tree as the sidebar lists it, under its expanded folders. */
export interface ProjectSidebarFile {
  /** Unique in the project; `toggleFolder` reports a folder's. */
  path: string;
  label: string;
  kind: FileRowKind;
  /** How many folders it sits in: 0 in the project's folder. */
  depth: number;
  /** A file's screen; a folder has none. */
  to?: RouteLocationRaw;
  /** A folder whose entries follow it. */
  expanded?: boolean;
  /** A file the agent is writing in now. */
  writing?: boolean;
  /** A file the agent waits to change while the person types in it. */
  waiting?: boolean;
}

export const ProjectSidebarProps = {
  /** The Memory screen. */
  memoryTo: { type: [String, Object] as PropType<RouteLocationRaw>, required: true },
  /** The Memory screen is open. */
  memorySelected: Boolean,
  /** The Schedules screen; the item shows only with it. */
  schedulesTo: defineProp<RouteLocationRaw>(),
  /** The Schedules screen (or a schedule's) is open. */
  schedulesSelected: Boolean,
  /** How many schedules there are, after the item's label; none while unknown. */
  schedulesCount: defineProp<number>(),
  /** In the order they are listed. */
  projects: { type: Array as PropType<readonly ProjectSidebarItem[]>, required: true },
  /** The id of the project open now. */
  selectedId: defineProp<string>(),
  /** The open project's conversations, newest first. */
  conversations: { type: Array as PropType<readonly ProjectSidebarConversation[]>, default: () => [] },
  /** The id of the conversation open now; none while the open project's screen (a new conversation) shows. */
  selectedConversationId: defineProp<string>(),
  /** The open project's every conversation; the All conversations item shows under its conversations only with it. */
  allConversationsTo: defineProp<RouteLocationRaw>(),
  /** The open project's every conversation is open. */
  allConversationsSelected: Boolean,
  /** The open project's file tree; `null` while it loads. */
  files: { type: Array as PropType<readonly ProjectSidebarFile[] | null>, default: null },
  /** The path of the file open now. */
  selectedFilePath: defineProp<string>(),
} as const;

export const ProjectSidebarEmits = {
  /** The person asked for a new project. */
  create: () => true,
  /** The person asked to expand or collapse the folder at this path. */
  toggleFolder: (_path: string) => true,
};
</script>

<script lang="ts" setup>
import { Brain, CalendarClock, FolderPlus } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { computed, useId } from 'vue';
import { RouterLink } from 'vue-router';

import Button from './Button.vue';
import ConversationRow from './ConversationRow.vue';
import FileRow from './FileRow.vue';
import ProjectRow from './ProjectRow.vue';
import * as l from './ProjectSidebar.loc.js';
import SidebarLabel from './SidebarLabel.vue';

const props = defineProps(ProjectSidebarProps);
const emit = defineEmits(ProjectSidebarEmits);

const t = useTranslate();
const headingId = useId();
const conversationsId = useId();
const filesId = useId();
/** Something under the open project shows, not the project's own screen (a new conversation). */
const childSelected = computed(() =>
  Boolean(props.selectedConversationId ?? props.selectedFilePath ?? props.allConversationsSelected),
);
const running = computed(() => props.conversations.some(conversation => conversation.running));
</script>

<template>
  <div :class="$style.projectSidebar">
    <div :class="$style.projectSidebar_windowBar">
      <Button
        :icon="FolderPlus"
        @click="emit('create')"
      >
        {{ t(l.newProject) }}
      </Button>
    </div>
    <nav
      :class="$style.projectSidebar_nav"
      :aria-label="t(l.navigation)"
    >
      <RouterLink
        :to="props.memoryTo"
        :class="[$style.projectSidebar_navItem, props.memorySelected && $style.projectSidebar_navItem_selected]"
        :aria-current="props.memorySelected ? 'page' : undefined"
      >
        <Brain
          :class="$style.projectSidebar_navIcon"
          aria-hidden="true"
        />
        {{ t(l.memory) }}
      </RouterLink>
      <RouterLink
        v-if="props.schedulesTo"
        :to="props.schedulesTo"
        :class="[$style.projectSidebar_navItem, props.schedulesSelected && $style.projectSidebar_navItem_selected]"
        :aria-current="props.schedulesSelected ? 'page' : undefined"
      >
        <CalendarClock
          :class="$style.projectSidebar_navIcon"
          aria-hidden="true"
        />
        {{ t(l.schedules) }}
        <span
          v-if="props.schedulesCount != null"
          :class="$style.projectSidebar_navCount"
          >{{ props.schedulesCount }}</span
        >
      </RouterLink>
    </nav>
    <nav
      :class="$style.projectSidebar_section"
      :aria-labelledby="headingId"
    >
      <h2
        :id="headingId"
        :class="$style.projectSidebar_heading"
      >
        {{ t(l.projects) }}
      </h2>
      <ul
        v-if="props.projects.length"
        :class="$style.projectSidebar_list"
      >
        <li
          v-for="project in props.projects"
          :key="project.id"
        >
          <ProjectRow
            :name="project.name"
            :color="project.color"
            :to="project.to"
            :selected="project.id === props.selectedId ? (childSelected ? 'true' : 'page') : undefined"
            :running="project.id === props.selectedId && running"
            :mark="project.mark"
          />
          <div
            v-if="project.id === props.selectedId"
            :class="$style.projectSidebar_children"
          >
            <SidebarLabel :id="conversationsId">{{ t(l.conversations) }}</SidebarLabel>
            <ul
              :class="$style.projectSidebar_rows"
              :aria-labelledby="conversationsId"
            >
              <li>
                <ConversationRow
                  kind="new"
                  :label="t(l.newConversation)"
                  :to="project.to"
                  :selected="!childSelected"
                />
              </li>
              <li
                v-for="conversation in props.conversations"
                :key="conversation.id"
              >
                <ConversationRow
                  :label="conversation.title"
                  :to="conversation.to"
                  :selected="conversation.id === props.selectedConversationId"
                  :running="conversation.running"
                  :scheduled="conversation.scheduled"
                />
              </li>
              <li v-if="props.allConversationsTo">
                <ConversationRow
                  kind="all"
                  :label="t(l.allConversations)"
                  :to="props.allConversationsTo"
                  :selected="props.allConversationsSelected"
                />
              </li>
            </ul>
            <SidebarLabel :id="filesId">{{ t(l.files) }}</SidebarLabel>
            <ul
              v-if="props.files?.length"
              :class="$style.projectSidebar_rows"
              :aria-labelledby="filesId"
            >
              <li
                v-for="file in props.files"
                :key="file.path"
              >
                <FileRow
                  :label="file.label"
                  :kind="file.kind"
                  :to="file.to"
                  :depth="file.depth"
                  :expanded="file.expanded"
                  :selected="file.path === props.selectedFilePath"
                  :writing="file.writing"
                  :waiting="file.waiting"
                  @toggle="emit('toggleFolder', file.path)"
                />
              </li>
            </ul>
            <p
              v-else-if="props.files"
              :class="$style.projectSidebar_noFiles"
            >
              {{ t(l.noFiles) }}
            </p>
          </div>
        </li>
      </ul>
      <p
        v-else
        :class="$style.projectSidebar_empty"
      >
        {{ t(l.noProjects) }}
      </p>
    </nav>
  </div>
</template>

<style lang="scss" module>
$window-bar-height: 48px; // where the window's own buttons sit, beside the New project button

.projectSidebar {
  display: flex;
  flex-direction: column;
  gap: $spacing-18;
  padding: $spacing-10 $spacing-18 $spacing-18;
}

.projectSidebar_windowBar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: $window-bar-height;
}

.projectSidebar_nav {
  display: flex;
  flex-direction: column;
}

.projectSidebar_navItem {
  display: flex;
  gap: $spacing-12;
  align-items: center;
  min-height: 32px;
  padding: $spacing-06 $spacing-10;
  border-radius: $radius-s;
  color: $color-ink;
  font-size: $font-size-body;
  line-height: $line-height-snug;
  text-decoration: none;
  transition: background-color $duration-fast;

  @include focus-ring;
  @include hover {
    background: $color-surface-glass;
  }
}

.projectSidebar_navItem_selected {
  background: $color-surface-glass;
  font-weight: $font-weight-semibold;
}

.projectSidebar_navCount {
  margin-left: auto;
  color: $color-ink-muted;
  font-size: $font-size-small;
  font-weight: $font-weight-regular;
}

.projectSidebar_navIcon {
  flex: none;
  width: 16px;
  height: 16px;
  color: $color-ink-muted;
}

.projectSidebar_section {
  display: flex;
  flex-direction: column;
  gap: $spacing-08;
}

.projectSidebar_heading {
  margin: 0;
  padding: 0 $spacing-10;
  // The design draws it in `$ink-faint`, which fails text contrast on the sidebar's background.
  color: $color-ink-body;
  font-size: $font-size-small;
  font-weight: $font-weight-regular;
  line-height: $line-height-snug;
}

.projectSidebar_list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.projectSidebar_children {
  display: flex;
  flex-direction: column;
  gap: $spacing-02;
  margin: $spacing-02 0 $spacing-08;
  padding: 0 0 0 $spacing-12;
}

.projectSidebar_rows {
  display: flex;
  flex-direction: column;
  gap: $spacing-02;
  margin: 0;
  padding: 0;
  list-style: none;
}

.projectSidebar_noFiles {
  margin: 0;
  padding: $spacing-04 $spacing-10;
  color: $color-ink-muted;
  font-size: $font-size-small;
  line-height: $line-height-snug;
}

.projectSidebar_empty {
  margin: 0;
  padding: 0 $spacing-10;
  color: $color-ink-body;
  font-size: $font-size-body;
  line-height: $line-height-normal;
}
</style>
