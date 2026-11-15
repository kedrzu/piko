<!-- An image file previewed whole: centred and scaled down to fit, a spinner until its address is known. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';

export const ImagePreviewProps = {
  /** Where the image loads from; none while it is being found. */
  src: defineProp<string>(),
  /** What the image is, for screen readers: its file's name. */
  alt: { type: String, required: true },
} as const;

export const ImagePreviewEmits = {
  /** The image did not load from `src`: the parent may try another address. */
  error: () => true,
};
</script>

<script lang="ts" setup>
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';

import * as l from './ImagePreview.loc.js';
import Spinner from './Spinner.vue';

const props = defineProps(ImagePreviewProps);
const emit = defineEmits(ImagePreviewEmits);

const t = useTranslate();
</script>

<template>
  <div :class="$style.imagePreview">
    <img
      v-if="props.src"
      :class="$style.imagePreview_image"
      :src="props.src"
      :alt="props.alt"
      @error="emit('error')"
    />
    <Spinner
      v-else
      :class="$style.imagePreview_spinner"
      :label="t(l.loading)"
    />
  </div>
</template>

<style lang="scss" module>
.imagePreview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  padding: $spacing-24;
  border: 1px solid $color-border;
  border-radius: $radius-m;
  background: $color-surface-soft;
}

.imagePreview_image {
  display: block;
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
}

.imagePreview_spinner {
  font-size: $font-size-heading;
}
</style>
