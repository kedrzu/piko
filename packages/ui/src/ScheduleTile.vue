<!-- A schedule's tile: its calendar on the link tint (white on a tinted box), small in a row, large over a screen; decorative, the text beside it says what it is. -->

<script lang="ts">
import type { LucideIcon } from '@lucide/vue';
import { defineProp } from '@nzyme/vue-utils/defineProp.js';

export const ScheduleTileProps = {
  /** 44px over a schedule's screen or its empty state; 30px in a row otherwise. */
  large: Boolean,
  /** White, for a tile on the link tint (the run header). */
  onTint: Boolean,
  /** The calendar by default; a crossed one for a schedule that is gone. */
  icon: defineProp<LucideIcon>(),
} as const;
</script>

<script lang="ts" setup>
import { CalendarClock } from '@lucide/vue';

const props = defineProps(ScheduleTileProps);
</script>

<template>
  <span
    :class="[$style.scheduleTile, props.large && $style.scheduleTile_large, props.onTint && $style.scheduleTile_onTint]"
    aria-hidden="true"
  >
    <component
      :is="props.icon ?? CalendarClock"
      :class="$style.scheduleTile_icon"
    />
  </span>
</template>

<style lang="scss" module>
.scheduleTile {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: $radius-s;
  background: $color-link-soft;
  color: $color-link-ink;
}

.scheduleTile_icon {
  width: 15px;
  height: 15px;
}

.scheduleTile_large {
  width: 44px;
  height: 44px;

  .scheduleTile_icon {
    width: 20px;
    height: 20px;
  }
}

.scheduleTile_onTint {
  background: $color-surface;
}
</style>
