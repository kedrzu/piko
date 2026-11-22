<!-- The dialog that confirms deleting a schedule (screen 78): what deleting it does (its runs go, its conversations stay in the project), Cancel and Delete schedule; Delete is busy until the deletion settles. -->

<script lang="ts">
export const ScheduleDeleteDialogProps = {
  name: { type: String, required: true },
  projectName: { type: String, required: true },
} as const;

/** What the dialog reports. */
export interface ScheduleDeleteDialogEvents {
  /** Delete the schedule; awaited, Delete schedule is busy until it settles. The parent closes the dialog. */
  confirm: [];
}
</script>

<script lang="ts" setup>
import { Trash2 } from '@lucide/vue';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { useEmitAsync } from '@nzyme/vue-utils/useEmitAsync.js';

import Button from './Button.vue';
import Dialog from './Dialog.vue';
import DialogDescription from './DialogDescription.vue';
import * as l from './ScheduleDeleteDialog.loc.js';

const props = defineProps(ScheduleDeleteDialogProps);
defineEmits<ScheduleDeleteDialogEvents>();
/** Whether the dialog shows; Cancel and Escape close it. */
const open = defineModel<boolean>('open', { default: false });

const emitAsync = useEmitAsync<ScheduleDeleteDialogEvents>();
const t = useTranslate();

function confirm() {
  return emitAsync('confirm');
}
</script>

<template>
  <Dialog
    v-model:open="open"
    :title="t(l.title, { name: props.name })"
  >
    <DialogDescription :class="$style.scheduleDeleteDialog_body">
      {{ t(l.body, { project: props.projectName }) }}
    </DialogDescription>
    <div :class="$style.scheduleDeleteDialog_actions">
      <Button
        variant="secondary"
        @click="open = false"
      >
        {{ t(l.cancel) }}
      </Button>
      <Button
        variant="destructive"
        :icon="Trash2"
        @click="confirm"
      >
        {{ t(l.confirm) }}
      </Button>
    </div>
  </Dialog>
</template>

<style lang="scss" module>
// The design's body is the dialog's text, not a quiet note: larger and in `ink-body`.
.scheduleDeleteDialog_body {
  color: $color-ink-body;
  font-size: $font-size-body;
}

.scheduleDeleteDialog_actions {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-08;
  justify-content: flex-end;
}
</style>
