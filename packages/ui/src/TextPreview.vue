<!-- A plain text file shown read-only as it is written: its line breaks and spaces kept, long lines wrapped. -->

<script lang="ts">
export const TextPreviewProps = {
  /** The file's whole text. */
  text: { type: String, required: true },
} as const;
</script>

<script lang="ts" setup>
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';

import * as l from './TextPreview.loc.js';

const props = defineProps(TextPreviewProps);

const t = useTranslate();
</script>

<template>
  <pre
    v-if="props.text.length > 0"
    :class="$style.textPreview"
    >{{ props.text }}</pre>
  <p
    v-else
    :class="$style.textPreview_empty"
  >
    {{ t(l.empty) }}
  </p>
</template>

<style lang="scss" module>
.textPreview {
  margin: 0;
  color: $color-ink;
  font-family: $font-family-body;
  font-size: $font-size-body-l;
  line-height: $line-height-relaxed;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.textPreview_empty {
  margin: 0;
  color: $color-ink-muted;
  font-size: $font-size-body-l;
}
</style>
