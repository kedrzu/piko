<!-- A project file's screen inside the app shell's card, scrolling as a whole: a document (an editor) in a centred column under any banner, or a preview under a head with the file's name, what it is and when it changed, Open in default app, and a note on how to change it. Not tied to a route: a side view shows it too. -->

<script lang="ts">
import { defineProp } from '@nzyme/vue-utils/defineProp.js';

/** How the file shows: a document in a centred column (its name only for screen readers), or a preview with a head. */
export type FileLayoutVariant = 'document' | 'preview';

export const FileLayoutProps = {
  /** The file's name as the person knows it. */
  title: { type: String, required: true },
  variant: defineProp<FileLayoutVariant>(),
  /** A preview's line under its name: what the file is and when it changed. */
  meta: defineProp<string>(),
  /** A preview offers Open in default app in its head. */
  openable: Boolean,
} as const;

export const FileLayoutEmits = {
  /** The person asked to open the file in its default app. The button stays busy while an async listener runs. */
  open: () => true,
};
</script>

<script lang="ts" setup>
import { ExternalLink } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { useEmitAsync } from '@nzyme/vue-utils/useEmitAsync.js';

import Button from './Button.vue';
import * as l from './FileLayout.loc.js';

const props = defineProps(FileLayoutProps);
defineEmits(FileLayoutEmits);
defineSlots<{
  /** The file's content: the editor or the preview. */
  default(): unknown;
  /** Above the content: why the file cannot be saved or changed now. */
  banner?(): unknown;
}>();

const t = useTranslate();
const emitAsync = useEmitAsync(FileLayoutEmits);

function open() {
  return emitAsync('open');
}
</script>

<template>
  <!-- A named, focusable region: the keyboard scrolls a long file even when it holds no control. -->
  <div
    :class="[$style.fileLayout, props.variant === 'preview' && $style.fileLayout_preview]"
    role="region"
    :aria-label="props.title"
    tabindex="0"
  >
    <div :class="$style.fileLayout_column">
      <header
        v-if="props.variant === 'preview'"
        :class="$style.fileLayout_head"
      >
        <div :class="$style.fileLayout_heading">
          <h1 :class="$style.fileLayout_title">
            {{ props.title }}
          </h1>
          <p
            v-if="props.meta"
            :class="$style.fileLayout_meta"
          >
            {{ props.meta }}
          </p>
        </div>
        <Button
          v-if="props.openable"
          variant="secondary"
          :icon="ExternalLink"
          @click="open"
        >
          {{ t(l.openInDefaultApp) }}
        </Button>
      </header>
      <h1
        v-else
        :class="$style.fileLayout_hiddenTitle"
      >
        {{ props.title }}
      </h1>
      <div
        v-if="$slots.banner"
        :class="$style.fileLayout_banner"
      >
        <slot name="banner" />
      </div>
      <slot />
      <p
        v-if="props.variant === 'preview'"
        :class="$style.fileLayout_note"
      >
        {{ t(l.previewNote) }}
      </p>
    </div>
  </div>
</template>

<style lang="scss" module>
$document-width: 680px; // the page's column, as screens 06 and 34 draw it

.fileLayout {
  flex: 1;
  min-height: 0;
  overflow-y: auto;

  &:focus-visible {
    outline: 2px solid $color-focus;
    outline-offset: -2px;
  }
}

.fileLayout_column {
  display: flex;
  flex-direction: column;
  gap: $spacing-24;
  max-width: $document-width;
  min-height: 100%;
  margin: 0 auto;
  padding: $spacing-28 $spacing-24;
}

.fileLayout_preview .fileLayout_column {
  gap: $spacing-18;
  max-width: none;
  padding: $spacing-28 $spacing-40;
}

.fileLayout_head {
  display: flex;
  gap: $spacing-24;
  align-items: flex-start;
  justify-content: space-between;
}

.fileLayout_heading {
  display: flex;
  flex-direction: column;
  gap: $spacing-06;
  min-width: 0;
}

.fileLayout_title {
  margin: 0;
  color: $color-ink;
  @include font-heading;
  font-size: $font-size-file-title;
  font-weight: $font-weight-bold;
  line-height: $line-height-tight;
  overflow-wrap: anywhere;
}

.fileLayout_hiddenTitle {
  @include visually-hidden;
}

.fileLayout_meta {
  margin: 0;
  color: $color-ink-muted;
  font-size: $font-size-small;
  line-height: $line-height-snug;
}

.fileLayout_banner {
  display: flex;
  flex-direction: column;
  gap: $spacing-12;
}

.fileLayout_note {
  margin: 0;
  color: $color-ink-muted;
  font-size: $font-size-caption;
  line-height: $line-height-snug;
}
</style>
