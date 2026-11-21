<!-- A conversation's screen inside the app shell's card: its messages in a centred column that scrolls and follows new text while it is scrolled to the end, and the composer (with any banner) under it; with a side view (frame 26), the conversation narrows to a 470px column beside it. -->

<script lang="ts">
export const ConversationLayoutEmits = {
  /** The person scrolled to the first message shown: older ones can be loaded above it. */
  reachTop: () => true,
};
</script>

<script lang="ts" setup>
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';

import * as l from './ConversationLayout.loc.js';

defineSlots<{
  /** The messages, oldest first. */
  default(): unknown;
  /** Under the messages: a banner and the composer. */
  footer(): unknown;
  /** Beside the conversation, taking the rest of the width: a file open in the side view. */
  aside?(): unknown;
}>();
const emit = defineEmits(ConversationLayoutEmits);
defineExpose({ scrollToEnd });

/** How close to the end still counts as at the end, so a pixel of rounding does not stop the following. */
const END_SLACK_PX = 48;

const t = useTranslate();
const scroller = useTemplateRef<HTMLElement>('scroller');
const content = useTemplateRef<HTMLElement>('content');
/** Scrolled to the end: new content keeps it there. */
const atEnd = ref(true);
/** Where the last scroll left the messages, to tell the person scrolling up from anything else. */
let lastScrollTop = 0;
let observer: ResizeObserver | undefined;

onMounted(() => {
  observer = new ResizeObserver(() => {
    if (atEnd.value) {
      scrollToEnd();
    }
  });
  // The messages growing, and the column shrinking under a taller footer (a banner, the hint while the agent works).
  if (content.value) {
    observer.observe(content.value);
  }
  if (scroller.value) {
    observer.observe(scroller.value);
  }
  scrollToEnd();
});

onBeforeUnmount(() => observer?.disconnect());

/** Shows the newest message, and keeps following from there. */
function scrollToEnd() {
  const element = scroller.value;
  if (element) {
    element.scrollTop = element.scrollHeight;
    atEnd.value = true;
  }
}

function onScroll() {
  const element = scroller.value;
  if (!element) {
    return;
  }
  const scrolledUp = element.scrollTop < lastScrollTop;
  lastScrollTop = element.scrollTop;
  // A scroll event comes after the layout it was made in: the messages may have grown again since, so only the person
  // scrolling up stops the following, never a scroll that reaches short of the end.
  if (element.scrollHeight - element.scrollTop - element.clientHeight <= END_SLACK_PX) {
    atEnd.value = true;
  } else if (scrolledUp) {
    atEnd.value = false;
  }
  if (element.scrollTop === 0 && element.scrollHeight > element.clientHeight) {
    emit('reachTop');
  }
}
</script>

<template>
  <div :class="[$style.conversationLayout, $slots.aside && $style.conversationLayout_split]">
    <div :class="$style.conversationLayout_conversation">
      <!-- A named, focusable region: the keyboard scrolls the messages even when none of them holds a control. -->
      <div
        ref="scroller"
        :class="$style.conversationLayout_scroller"
        role="region"
        :aria-label="t(l.messages)"
        tabindex="0"
        @scroll.passive="onScroll"
      >
        <div
          ref="content"
          :class="$style.conversationLayout_messages"
        >
          <slot />
        </div>
      </div>
      <div :class="$style.conversationLayout_footer">
        <slot name="footer" />
      </div>
    </div>
    <slot name="aside" />
  </div>
</template>

<style lang="scss" module>
$column-width: 760px; // the messages and the composer, as screens 56–61 draw them
$split-width: 470px; // the conversation beside a side view, as frame 26 draws it

.conversationLayout {
  display: flex;
  flex: 1;
  min-height: 0;
}

.conversationLayout_conversation {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;

  .conversationLayout_split > & {
    flex: none;
    width: $split-width;
    border-right: 1px solid $color-border;
  }
}

.conversationLayout_scroller {
  // The containing block of what it scrolls: absolutely positioned content would otherwise lengthen the window.
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;

  &:focus-visible {
    outline: 2px solid $color-focus;
    outline-offset: -2px;
  }
}

.conversationLayout_messages {
  display: flex;
  flex-direction: column;
  gap: $spacing-24;
  max-width: $column-width;
  margin: 0 auto;
  padding: $spacing-24 $spacing-24 $spacing-28;
}

.conversationLayout_footer {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: $spacing-18;
  width: 100%;
  max-width: $column-width;
  margin: 0 auto;
  padding: 0 $spacing-24 $spacing-24;

  .conversationLayout_split & {
    padding-bottom: $spacing-18;
  }
}
</style>
