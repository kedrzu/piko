<!-- A label over a group of rows in the sidebar, such as a project's Conversations or Files: a small quiet heading. -->

<template>
  <h3 :class="$style.sidebarLabel">
    <slot />
  </h3>
</template>

<style lang="scss" module>
.sidebarLabel {
  margin: 0;
  padding: $spacing-06 $spacing-10 $spacing-02;
  // The design draws it in `$ink-faint`, which fails text contrast on the sidebar's background.
  color: $color-ink-muted;
  font-size: $font-size-micro;
  font-weight: $font-weight-regular;
  line-height: $line-height-snug;
}
</style>
