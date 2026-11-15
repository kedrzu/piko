<!-- Above the composer or a file, what stops the person now and what to do: a box with a title, a line and an optional action, or several in the `actions` slot; an attention box for a problem (announced as an alert), a quiet one with its own icon for what the agent is doing or waits for (announced politely). -->

<script lang="ts">
import type { LucideIcon } from '@lucide/vue';
import { defineProp } from '@nzyme/vue-utils/defineProp.js';

/**
 * `attention`: a problem to fix or wait out; `agent`: what the agent is doing, nothing wrong; `waiting`: the agent waits
 * for the person, nothing wrong.
 */
export type StatusBannerTone = 'attention' | 'agent' | 'waiting';

export const StatusBannerProps = {
  title: { type: String, required: true },
  body: { type: String, required: true },
  /** The fix, as a button; none when there is nothing the person can do but wait. */
  actionLabel: defineProp<string>(),
  /** An icon from `@lucide/vue` before the action's label. */
  actionIcon: defineProp<LucideIcon>(),
  tone: defineProp<StatusBannerTone>(),
  /** An icon from `@lucide/vue` before the title, instead of the tone's own. */
  icon: defineProp<LucideIcon>(),
} as const;

export const StatusBannerEmits = {
  /** The person chose the action. The button stays busy while an async listener runs. */
  action: () => true,
};
</script>

<script lang="ts" setup>
import { CircleAlert } from '@lucide/vue';
import { useEmitAsync } from '@nzyme/vue-utils/useEmitAsync.js';
import { computed } from 'vue';

import Button from './Button.vue';

const props = defineProps(StatusBannerProps);
defineEmits(StatusBannerEmits);
const slots = defineSlots<{
  /** Several fixes, as `Button`s (the `attention` variant in an attention box); shown instead of the one action. */
  actions?(): unknown;
}>();

const emitAsync = useEmitAsync(StatusBannerEmits);
const tone = computed(() => props.tone ?? 'attention');

function act() {
  return emitAsync('action');
}
</script>

<template>
  <div
    :class="[$style.statusBanner, $style[`statusBanner_${tone}`]]"
    :role="tone === 'attention' ? 'alert' : 'status'"
  >
    <component
      :is="props.icon ?? CircleAlert"
      :class="$style.statusBanner_icon"
      aria-hidden="true"
    />
    <div :class="$style.statusBanner_text">
      <p :class="$style.statusBanner_title">
        {{ props.title }}
      </p>
      <p :class="$style.statusBanner_body">
        {{ props.body }}
      </p>
    </div>
    <div
      v-if="slots.actions"
      :class="$style.statusBanner_actions"
    >
      <slot name="actions" />
    </div>
    <Button
      v-else-if="props.actionLabel"
      :variant="tone === 'attention' ? 'attention' : 'secondary'"
      :icon="props.actionIcon"
      @click="act"
    >
      {{ props.actionLabel }}
    </Button>
  </div>
</template>

<style lang="scss" module>
.statusBanner {
  display: flex;
  gap: $spacing-14;
  align-items: center;
  padding: $spacing-12 $spacing-14 $spacing-12 $spacing-14;
  border-radius: $radius-m;
  background: var(--status-banner-fill);
}

.statusBanner_attention {
  --status-banner-fill: #{$color-attention-soft};
  --status-banner-icon: #{$color-attention-ink};
}

.statusBanner_agent {
  --status-banner-fill: #{$color-surface-soft};
  --status-banner-icon: #{$color-brand-1-strong};
}

.statusBanner_waiting {
  --status-banner-fill: #{$color-link-soft};
  --status-banner-icon: #{$color-link-ink};
}

.statusBanner_icon {
  flex: none;
  width: 18px;
  height: 18px;
  color: var(--status-banner-icon);
}

.statusBanner_text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: $spacing-02;
  min-width: 0;
}

.statusBanner_actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: $spacing-08;
  justify-content: flex-end;
}

.statusBanner_title {
  margin: 0;
  color: $color-ink;
  font-size: $font-size-body;
  font-weight: $font-weight-semibold;
  line-height: $line-height-snug;
}

.statusBanner_body {
  margin: 0;
  color: $color-ink-body;
  font-size: $font-size-control;
  line-height: $line-height-snug;
}
</style>
