<!-- A CSV file shown read-only as a table: its first row as the header, short rows padded, the first rows only of a long file (it says so), scrolling sideways when wide. -->

<script lang="ts">
/** The most rows rendered: a file up to the 1 MiB the app reads can hold tens of thousands. */
export const CSV_PREVIEW_MAX_ROWS = 1000;

export const CsvPreviewProps = {
  /** The file's whole text. */
  text: { type: String, required: true },
} as const;
</script>

<script lang="ts" setup>
import { useLanguage } from '@nzyme/vue-i18n/useLanguage.js';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { computed } from 'vue';

import * as l from './CsvPreview.loc.js';
import { parseCsv } from './utils/parseCsv.js';

const props = defineProps(CsvPreviewProps);

const t = useTranslate();
const language = useLanguage();
const rows = computed(() => parseCsv(props.text));
const width = computed(() => Math.max(0, ...rows.value.map(row => row.length)));
const header = computed(() => pad(rows.value[0] ?? []));
const body = computed(() => rows.value.slice(1, CSV_PREVIEW_MAX_ROWS + 1).map(pad));
/** Rows under the header. */
const total = computed(() => Math.max(0, rows.value.length - 1));

function pad(row: string[]) {
  return row.length < width.value ? [...row, ...Array.from({ length: width.value - row.length }, () => '')] : row;
}
</script>

<template>
  <div
    v-if="rows.length > 0"
    :class="$style.csvPreview"
  >
    <!-- A named, focusable region: the keyboard scrolls a wide table sideways. -->
    <div
      :class="$style.csvPreview_scroller"
      role="region"
      :aria-label="t(l.table)"
      tabindex="0"
    >
      <table :class="$style.csvPreview_table">
        <thead>
          <tr>
            <th
              v-for="(cell, index) in header"
              :key="index"
              scope="col"
            >
              {{ cell }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, rowIndex) in body"
            :key="rowIndex"
          >
            <td
              v-for="(cell, index) in row"
              :key="index"
            >
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p
      v-if="total > CSV_PREVIEW_MAX_ROWS"
      :class="$style.csvPreview_truncated"
    >
      {{
        t(l.truncated, {
          count: total,
          shown: CSV_PREVIEW_MAX_ROWS.toLocaleString(language),
        })
      }}
    </p>
  </div>
  <p
    v-else
    :class="$style.csvPreview_empty"
  >
    {{ t(l.empty) }}
  </p>
</template>

<style lang="scss" module>
.csvPreview {
  display: flex;
  flex-direction: column;
  gap: $spacing-10;
}

.csvPreview_scroller {
  // The containing block of what it scrolls: absolutely positioned content would otherwise lengthen the window.
  position: relative;
  overflow-x: auto;
  border: 1px solid $color-border;
  border-radius: $radius-m;

  &:focus-visible {
    outline: 2px solid $color-focus;
    outline-offset: 2px;
  }
}

.csvPreview_table {
  width: 100%;
  border-collapse: collapse;
  color: $color-ink;
  font-size: $font-size-body;
  line-height: $line-height-snug;

  th,
  td {
    padding: $spacing-08 $spacing-12;
    border-bottom: 1px solid $color-border;
    text-align: left;
    vertical-align: top;
    white-space: pre-wrap;
  }

  th + th,
  td + td {
    border-left: 1px solid $color-border;
  }

  th {
    background: $color-surface-soft;
    font-weight: $font-weight-semibold;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }
}

.csvPreview_truncated,
.csvPreview_empty {
  margin: 0;
  color: $color-ink-muted;
  font-size: $font-size-small;
}
</style>
