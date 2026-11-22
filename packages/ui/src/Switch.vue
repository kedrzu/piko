<!-- An on/off switch (reka-ui's `Switch`): a pill whose knob slides right and fills with the brand colour when on. It only reports the change; the parent owns the state and can refuse it. -->

<script lang="ts">
export const SwitchProps = {
  /** On or off, as the parent holds it; the switch shows the new state only once the parent passes it back. */
  modelValue: { type: Boolean, required: true },
  /** What the switch turns on and off, its accessible name; the design shows no visible label beside it. */
  label: { type: String, required: true },
  disabled: Boolean,
} as const;

export const SwitchEmits = {
  /** The person flipped the switch to this state. */
  'update:modelValue': (_value: boolean) => true,
};
</script>

<script lang="ts" setup>
import { SwitchRoot, SwitchThumb } from 'reka-ui';

const props = defineProps(SwitchProps);
const emit = defineEmits(SwitchEmits);
</script>

<template>
  <SwitchRoot
    :model-value="props.modelValue"
    :disabled="props.disabled"
    :aria-label="props.label"
    :class="$style.switch"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <SwitchThumb :class="$style.switch_knob" />
  </SwitchRoot>
</template>

<style lang="scss" module>
// The track is drawn by `::before`, 20px tall inside a 24px button, so the target meets 2.5.8.
.switch {
  position: relative;
  flex: none;
  width: 34px;
  height: 24px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: $radius-pill;
  background: transparent;
  cursor: pointer;

  @include focus-ring;

  &::before {
    position: absolute;
    inset: $spacing-02 0;
    border-radius: $radius-pill;
    // `field-border`, not the design's `border-strong`: the off track needs 3:1 against the surface (1.4.11).
    background: $color-field-border;
    content: '';
    transition: background-color $duration-fast;
  }

  &[data-state='checked']::before {
    // `brand-1-strong`, not `brand-1`: Lemonade's `brand-1` is under 3:1 on white.
    background: $color-brand-1-strong;
  }

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
}

.switch_knob {
  position: absolute;
  top: $spacing-04;
  left: $spacing-02;
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: $color-surface;
  transition: transform $duration-fast;

  &[data-state='checked'] {
    transform: translateX(14px);
  }

  @include reduced-motion {
    transition: none;
  }
}
</style>
