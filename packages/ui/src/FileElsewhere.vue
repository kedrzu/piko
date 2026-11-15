<!-- A project file the app cannot show (of a kind it does not preview, or too large): its name, why, and Open in default app when the file is a document safe to open. -->

<script lang="ts">
import type { PropType } from 'vue';

/** Why the file is not shown: a kind the app does not preview, or more than it reads. */
export type FileElsewhereReason = 'unsupported' | 'tooLarge';

export const FileElsewhereProps = {
  /** The file's name with its extension. */
  name: { type: String, required: true },
  reason: { type: String as PropType<FileElsewhereReason>, default: 'unsupported' },
  /** The file may be opened in its default app: a document, never an app or a script. */
  openable: Boolean,
} as const;

export const FileElsewhereEmits = {
  /** The person asked to open the file in its default app. The button stays busy while an async listener runs. */
  open: () => true,
};
</script>

<script lang="ts" setup>
import { ExternalLink, File } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { useEmitAsync } from '@nzyme/vue-utils/useEmitAsync.js';

import Button from './Button.vue';
import * as l from './FileElsewhere.loc.js';

const props = defineProps(FileElsewhereProps);
defineEmits(FileElsewhereEmits);

const t = useTranslate();
const emitAsync = useEmitAsync(FileElsewhereEmits);

function open() {
  return emitAsync('open');
}
</script>

<template>
  <div :class="$style.fileElsewhere">
    <File
      :class="$style.fileElsewhere_icon"
      aria-hidden="true"
    />
    <p :class="$style.fileElsewhere_name">
      {{ props.name }}
    </p>
    <p :class="$style.fileElsewhere_body">
      {{ props.reason === 'tooLarge' ? t(l.tooLarge) : t(l.unsupported) }}
      {{ props.openable ? t(l.openHint) : t(l.askHint) }}
    </p>
    <Button
      v-if="props.openable"
      variant="secondary"
      :icon="ExternalLink"
      @click="open"
    >
      {{ t(l.openInDefaultApp) }}
    </Button>
  </div>
</template>

<style lang="scss" module>
.fileElsewhere {
  display: flex;
  flex-direction: column;
  gap: $spacing-12;
  align-items: center;
  padding: $spacing-48 $spacing-24;
  text-align: center;
}

.fileElsewhere_icon {
  width: 32px;
  height: 32px;
  color: $color-ink-muted;
}

.fileElsewhere_name {
  margin: 0;
  color: $color-ink;
  @include font-heading;
  font-size: $font-size-heading;
  font-weight: $font-weight-bold;
  line-height: $line-height-tight;
  overflow-wrap: anywhere;
}

.fileElsewhere_body {
  max-width: 420px;
  margin: 0;
  color: $color-ink-body;
  font-size: $font-size-body;
  line-height: $line-height-relaxed;
}
</style>
