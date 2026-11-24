<!-- A filter over a list, as a pill: its label, an optional count and a schedule's calendar when it filters by one; filled dark when on. A link (the filter lives in the address) marked current when on, or a toggle button. -->

<script lang="ts">
import { useButton } from '@nzyme/vue-forms/components/useButton.js';
import { defineProp } from '@nzyme/vue-utils/defineProp.js';

export const FilterChipProps = {
  ...useButton.props,
  label: { type: String, required: true },
  /** How many items the filter leaves. */
  count: defineProp<number>(),
  /** The filter keeps what one schedule started: its calendar before the label. */
  schedule: Boolean,
  /**
   * The filter in force: filled dark, and `aria-current` on a link or `aria-pressed` on a button. A chip with `link`
   * leads to the list filtered by it; without one it is a toggle and its parent flips `on` on `click`.
   */
  on: Boolean,
};
export const FilterChipEmits = useButton.emits;
</script>

<script lang="ts" setup>
import { CalendarClock } from '@lucide/vue';

const props = defineProps(FilterChipProps);
defineEmits(FilterChipEmits);

const { Button } = useButton();
</script>

<template>
  <Button
    :class="[$style.filterChip, props.on && $style.filterChip_on]"
    :aria-current="props.link && props.on ? 'true' : undefined"
    :aria-pressed="props.link ? undefined : props.on"
  >
    <CalendarClock
      v-if="props.schedule"
      :class="$style.filterChip_icon"
      aria-hidden="true"
    />
    <span>{{ props.label }}</span>
    <span
      v-if="props.count != null"
      :class="$style.filterChip_count"
      >{{ props.count }}</span
    >
  </Button>
</template>

<style lang="scss" module>
.filterChip {
  display: inline-flex;
  flex: none;
  gap: $spacing-06;
  align-items: center;
  min-height: 24px;
  margin: 0;
  padding: calc($spacing-06 - 1px) calc($spacing-12 - 1px);
  border: 1px solid $color-border;
  border-radius: $radius-pill;
  background: $color-surface;
  color: $color-ink-body;
  font: inherit;
  font-size: $font-size-caption;
  line-height: $line-height-snug;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color $duration-fast;

  @include focus-ring;
  @include hover {
    background: $color-surface-soft;
  }
}

.filterChip_on {
  border-color: $color-ink;
  background: $color-ink;
  color: $color-on-ink;
  font-weight: $font-weight-semibold;

  @include hover {
    background: $color-ink;
  }

  .filterChip_icon,
  .filterChip_count {
    color: $color-on-ink;
  }
}

.filterChip_icon {
  flex: none;
  width: 13px;
  height: 13px;
  color: $color-ink-muted;
}

// `ink-muted`, not the design's `ink-faint`: the count is text, and `ink-faint` is under 4.5:1.
.filterChip_count {
  color: $color-ink-muted;
  font-size: $font-size-badge;
  font-weight: $font-weight-regular;
}
</style>
