<!-- A checkbox option: a full-width row with a rounded box and its label, the whole row toggling it; the box fills with a check when chosen. -->

<script lang="ts">
import { useCheckbox } from '@nzyme/vue-forms/components/useCheckbox.jsx';

export const CheckboxProps = useCheckbox.props;
export const CheckboxEmits = useCheckbox.emits;
</script>

<script lang="ts" setup>
import { Check } from '@lucide/vue';

defineProps(CheckboxProps);
defineEmits(CheckboxEmits);
defineSlots<{
  /** The label, also the checkbox's accessible name. */
  default(): unknown;
}>();

const { Checkbox } = useCheckbox();
</script>

<template>
  <Checkbox :class="$style.checkbox">
    <span :class="$style.checkbox_box">
      <Check
        :class="$style.checkbox_check"
        aria-hidden="true"
      />
    </span>
    <span :class="$style.checkbox_label"><slot /></span>
  </Checkbox>
</template>

<style lang="scss" module>
.checkbox {
  display: flex;
  gap: $spacing-10;
  align-items: flex-start;
  width: 100%;
  min-height: 40px;
  margin: 0;
  padding: calc($spacing-10 - 1px) calc($spacing-12 - 1px);
  border: 1px solid $color-border-strong;
  border-radius: $radius-m;
  background: $color-surface;
  color: $color-ink;
  font: inherit;
  font-size: $font-size-body;
  line-height: $line-height-snug;
  text-align: left;
  cursor: pointer;

  @include focus-ring;

  &[aria-invalid='true'] {
    border-color: $color-attention-border;
  }

  &:disabled {
    border-color: $color-border;
    background: $color-surface-soft;
    color: $color-ink-muted;
    cursor: default;
  }
}

.checkbox_box {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1.5px solid $color-field-border;
  border-radius: 6px;
  background: $color-surface;
  color: $color-on-ink;
  transition: background-color $duration-fast;

  [aria-checked='true'] > & {
    border-color: $color-brand-1-strong;
    background: $color-brand-1-strong;
  }

  :disabled > & {
    border-color: $color-border-strong;
    background: $color-surface-soft;
  }

  [aria-checked='true']:disabled > & {
    border-color: $color-border-strong;
    background: $color-border-strong;
    color: $color-ink-muted;
  }
}

.checkbox_check {
  width: 13px;
  height: 13px;
  stroke-width: 3;
  opacity: 0;

  [aria-checked='true'] > .checkbox_box > & {
    opacity: 1;
  }
}
</style>
