<!-- A message floating in the corner (reka-ui's `Toast`, inside a `Toaster`): an icon tile carrying the tone, a title, what happened and its actions, with a × to close it. A timed one closes by itself, counting down in a ring around the ×, never while hovered or focused; a pinned one stays until closed. -->

<script lang="ts">
import type { LucideIcon } from '@lucide/vue';
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import type { PropType } from 'vue';

/**
 * How long a toast stays, in ms: `timed` for news and outcomes (an Undo included), `pinned` for what needs the person
 * and stays until closed.
 */
export const TOAST_LASTS = {
  timed: 8_000,
  pinned: Number.POSITIVE_INFINITY,
} as const;

/** One of the lifetimes of `TOAST_LASTS`. */
export type ToastLasts = keyof typeof TOAST_LASTS;

/**
 * What the toast's icon tile says: `neutral` an outcome, nothing wrong; `accent` news worth acting on; `warning`
 * something failed and can be tried again.
 */
export type ToastTone = 'neutral' | 'accent' | 'warning';

export const ToastProps = {
  title: { type: String, required: true },
  tone: { type: String as PropType<ToastTone>, default: 'neutral' },
  /** An icon from `@lucide/vue` instead of the tone's own. */
  icon: defineProp<LucideIcon>(),
  lasts: { type: String as PropType<ToastLasts>, default: 'pinned' },
  /**
   * `false` disables the × while closing would cut something short (a restart under way); the toast then stays, timed
   * or not, until its consumer closes it through `open`.
   */
  closable: { type: Boolean, default: true },
  /** The ×'s accessible name. */
  closeLabel: defineProp<string>(),
} as const;
</script>

<script lang="ts" setup>
import { Info, Sparkles, TriangleAlert, X } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { ToastClose, ToastDescription, ToastRoot, ToastTitle } from 'reka-ui';
import { computed, ref, useTemplateRef, watch } from 'vue';

import * as l from './Toast.loc.js';

const props = defineProps(ToastProps);
/** Whether it shows; the ×, a focused Escape and the timeout set it to `false`. */
const open = defineModel<boolean>('open', { default: true });
defineSlots<{
  /** What happened, under the title. */
  default?(): unknown;
  /** Buttons under the description. */
  actions?(): unknown;
}>();

const t = useTranslate();
const root = useTemplateRef('root');
const icons = {
  neutral: Info,
  accent: Sparkles,
  warning: TriangleAlert,
};
const lifetime = computed(() => TOAST_LASTS[props.lasts]);
const timed = computed(() => Number.isFinite(lifetime.value));
/** When it opened, and whether reka's countdown has resumed since: see `getElapsed`. */
let openedAt = Date.now();
const resumed = ref(false);
/** reka-ui closes every toast on any Escape; set when this one is not the Escape's: see `onEscapeKeyDown`. */
let keepOnEscape = false;

watch(open, value => {
  if (value) {
    openedAt = Date.now();
    resumed.value = false;
  }
});

// Only an Escape pressed inside the toast closes it. One pressed elsewhere is someone else's (a dialog's, a field's),
// so the toast stays. Not with `preventDefault()`: the layer the Escape is for would take it as handled.
function onEscapeKeyDown(event: KeyboardEvent) {
  const element: unknown = root.value?.$el;
  const inside = element instanceof Element && event.target instanceof Node && element.contains(event.target);
  if (!inside) {
    keepOnEscape = true;
    queueMicrotask(() => (keepOnEscape = false));
  }
}

function onOpenChange(value: boolean) {
  if (!value && (keepOnEscape || !props.closable)) {
    keepOnEscape = false;
    return;
  }

  open.value = value;
}

/**
 * The part of its lifetime gone, from 0 to 1, for the ring's empty arc. Opened while the toasts were paused (the
 * pointer over them), reka's countdown has not started and counts `remaining` from the epoch, so 0: until it resumes,
 * a `remaining` of 0 before the lifetime could have passed is a full ring.
 */
function getElapsed(remaining: number, total: number) {
  if (remaining <= 0 && !resumed.value && Date.now() - openedAt < total) {
    return 0;
  }

  return Math.min(Math.max(1 - remaining / total, 0), 1);
}
</script>

<template>
  <ToastRoot
    ref="root"
    v-slot="{ remaining, duration: total }"
    :open="open"
    :class="[$style.toast, $style[`toast_${props.tone}`]]"
    :duration="lifetime"
    @update:open="onOpenChange"
    @escape-key-down="onEscapeKeyDown"
    @resume="resumed = true"
  >
    <span :class="$style.toast_tile">
      <component
        :is="props.icon ?? icons[props.tone]"
        :class="$style.toast_icon"
        aria-hidden="true"
      />
    </span>
    <div :class="$style.toast_body">
      <ToastTitle :class="$style.toast_title">
        {{ props.title }}
      </ToastTitle>
      <ToastDescription
        v-if="$slots.default"
        :class="$style.toast_description"
      >
        <slot />
      </ToastDescription>
      <div
        v-if="$slots.actions"
        :class="$style.toast_actions"
      >
        <slot name="actions" />
      </div>
    </div>
    <span :class="$style.toast_dismiss">
      <!-- Updated as reka counts down, with no transition: it shows the time left, it doesn't animate. -->
      <svg
        v-if="timed"
        :class="$style.toast_countdown"
        viewBox="0 0 30 30"
        aria-hidden="true"
      >
        <circle
          :class="$style.toast_countdownTrack"
          cx="15"
          cy="15"
          r="12"
        />
        <circle
          :class="$style.toast_countdownRing"
          cx="15"
          cy="15"
          r="12"
          pathLength="1"
          stroke-dasharray="1"
          :stroke-dashoffset="-getElapsed(remaining, total)"
        />
      </svg>
      <ToastClose
        :class="$style.toast_close"
        :aria-label="props.closeLabel ?? t(l.close)"
        :disabled="!props.closable"
      >
        <X
          :class="$style.toast_closeIcon"
          aria-hidden="true"
        />
      </ToastClose>
    </span>
  </ToastRoot>
</template>

<style lang="scss" module>
$toast-tile-size: 30px;
$toast-ring-width: 2px;

.toast {
  --toast-tile-background: #{$color-surface-soft};
  --toast-tile-icon: #{$color-ink-muted};

  display: flex;
  gap: $spacing-12;
  align-items: flex-start;
  padding: calc($spacing-14 - 1px) calc($spacing-12 - 1px) calc($spacing-14 - 1px) calc($spacing-14 - 1px);
  border: 1px solid $color-border;
  border-radius: $radius-l;
  background: $color-surface;
  box-shadow: $shadow-toast;

  @include focus-ring;
}

.toast_accent {
  --toast-tile-background: #{$color-brand-1-strong};
  --toast-tile-icon: #{$color-on-ink};
}

.toast_warning {
  --toast-tile-background: #{$color-attention-soft};
  --toast-tile-icon: #{$color-attention-ink};
}

.toast_tile {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: $toast-tile-size;
  height: $toast-tile-size;
  border-radius: $radius-s;
  background: var(--toast-tile-background);
}

.toast_icon {
  width: 15px;
  height: 15px;
  color: var(--toast-tile-icon);
}

.toast_body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: $spacing-toast-text-gap;
  min-width: 0;
  padding-top: $spacing-toast-title-top;
}

.toast_title {
  color: $color-ink;
  font-size: $font-size-body-s;
  font-weight: $font-weight-semibold;
  line-height: $line-height-snug;
  overflow-wrap: anywhere;
}

.toast_description {
  color: $color-ink-body;
  font-size: $font-size-control;
  line-height: $line-height-relaxed;
  overflow-wrap: anywhere;
}

.toast_actions {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-08;
  padding-top: $spacing-12 - $spacing-toast-text-gap;
}

// The × in a box the tile's size, so the two centre on one line.
.toast_dismiss {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: $toast-tile-size;
  height: $toast-tile-size;
}

// Starts at 12 o'clock; the empty arc grows clockwise from there.
.toast_countdown {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  transform: rotate(-90deg);

  circle {
    fill: none;
    stroke-width: $toast-ring-width;
  }
}

.toast_countdownTrack {
  stroke: $color-border;
}

.toast_countdownRing {
  stroke: $color-ink-muted;
}

.toast_close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  border-radius: $radius-pill;
  background: transparent;
  color: $color-ink-muted;
  cursor: pointer;

  @include focus-ring;

  &:not(:disabled) {
    @include hover {
      background: $color-surface-soft;
    }
  }

  &:disabled {
    color: $color-border-strong;
    cursor: default;
  }
}

.toast_closeIcon {
  width: 14px;
  height: 14px;
}
</style>
