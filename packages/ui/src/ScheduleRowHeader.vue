<!-- The head of the schedules table (screen 09), an ARIA row of column headers over `ScheduleRow`s: Name, Project, When, Last run and On, on the soft surface. The table around them (`role="table"`) is the screen's. -->

<script lang="ts" setup>
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';

import * as l from './ScheduleRowHeader.loc.js';

const t = useTranslate();
</script>

<template>
  <div
    role="row"
    :class="$style.scheduleRowHeader"
  >
    <span aria-hidden="true" />
    <span role="columnheader">{{ t(l.name) }}</span>
    <span role="columnheader">{{ t(l.project) }}</span>
    <span role="columnheader">{{ t(l.when) }}</span>
    <span role="columnheader">{{ t(l.lastRun) }}</span>
    <span role="columnheader">{{ t(l.on) }}</span>
  </div>
</template>

<style lang="scss" module>
.scheduleRowHeader {
  @include schedule-table-columns;

  padding-block: $spacing-10;
  border-bottom: 1px solid $color-border;
  background: $color-surface-soft;
  // `ink-muted`, not the design's `ink-faint`: these are text, and `ink-faint` is under 4.5:1.
  color: $color-ink-muted;
  font-size: $font-size-micro;
  font-weight: $font-weight-semibold;
  line-height: $line-height-snug;
  letter-spacing: $letter-spacing-column-head;
}
</style>
