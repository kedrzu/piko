<!-- A PDF file previewed in the browser's own viewer, as tall as the screen allows, a spinner until its address is known. Swappable for File elsewhere where the viewer cannot show it. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';

export const PdfPreviewProps = {
  /** Where the PDF loads from; none while it is being found. */
  src: defineProp<string>(),
  /** The viewer's accessible name: the file's name. */
  title: { type: String, required: true },
} as const;
</script>

<script lang="ts" setup>
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';

import * as l from './PdfPreview.loc.js';
import Spinner from './Spinner.vue';

const props = defineProps(PdfPreviewProps);

const t = useTranslate();
</script>

<template>
  <div :class="$style.pdfPreview">
    <iframe
      v-if="props.src"
      :class="$style.pdfPreview_frame"
      :src="props.src"
      :title="props.title"
    />
    <Spinner
      v-else
      :class="$style.pdfPreview_spinner"
      :label="t(l.loading)"
    />
  </div>
</template>

<style lang="scss" module>
.pdfPreview {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 75vh;
  min-height: 320px;
  overflow: hidden;
  border: 1px solid $color-border;
  border-radius: $radius-m;
  background: $color-surface-soft;
}

.pdfPreview_frame {
  width: 100%;
  height: 100%;
  border: 0;
}

.pdfPreview_spinner {
  font-size: $font-size-heading;
}
</style>
