<!-- A row under the open project in the sidebar: a conversation (a speech bubble, its title, a spinner while the agent works; a schedule's calendar after the title, in place of the bubble, when a schedule started it) or New conversation (a plus); a link, white when open. -->

<script lang="ts">
import type { PropType } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

/** What the row opens: a conversation, or the project's empty state to start a new one. */
export type ConversationRowKind = 'conversation' | 'new';

export const ConversationRowProps = {
  label: { type: String, required: true },
  to: { type: [String, Object] as PropType<RouteLocationRaw>, required: true },
  kind: { type: String as PropType<ConversationRowKind>, default: 'conversation' },
  /** Open now: white, a stronger label and `aria-current="page"`. */
  selected: Boolean,
  /** The agent is working on the conversation. */
  running: Boolean,
  /** A schedule started the conversation: its calendar after the title instead of the speech bubble before it. */
  scheduled: Boolean,
} as const;
</script>

<script lang="ts" setup>
import { CalendarClock, MessageCircle, Plus } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { RouterLink } from 'vue-router';

import * as l from './ConversationRow.loc.js';
import Spinner from './Spinner.vue';

const props = defineProps(ConversationRowProps);

const t = useTranslate();
</script>

<template>
  <RouterLink
    :to="props.to"
    :class="[$style.conversationRow, props.selected && $style.conversationRow_selected]"
    :aria-current="props.selected ? 'page' : undefined"
  >
    <!-- A scheduled row keeps the bubble's place, so its title lines up with the others. -->
    <component
      :is="props.kind === 'new' ? Plus : MessageCircle"
      :class="[$style.conversationRow_icon, props.scheduled && $style.conversationRow_icon_hidden]"
      aria-hidden="true"
    />
    <span :class="$style.conversationRow_label">{{ props.label }}</span>
    <template v-if="props.scheduled">
      <CalendarClock
        :class="$style.conversationRow_icon"
        aria-hidden="true"
      />
      <span :class="$style.conversationRow_hidden">{{ t(l.scheduled) }}</span>
    </template>
    <Spinner
      v-if="props.running"
      :class="$style.conversationRow_spinner"
      :label="t(l.running)"
    />
  </RouterLink>
</template>

<style lang="scss" module>
.conversationRow {
  @include sidebar-row;
}

.conversationRow_selected {
  @include sidebar-row-selected;
}

.conversationRow_icon {
  flex: none;
  width: 14px;
  height: 14px;
  color: $color-ink-muted;
}

.conversationRow_icon_hidden {
  visibility: hidden;
}

.conversationRow_hidden {
  @include visually-hidden;
}

.conversationRow_label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversationRow_spinner {
  font-size: $font-size-body-s;
}
</style>
