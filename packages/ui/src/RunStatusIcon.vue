<!-- What became of a schedule's run, or of a conversation, as an icon in its colour: turning while it runs, a play sign when it started and how it went is unknown, a check when finished, a moon when late, a crossed calendar when skipped, an alert when it couldn't start, a dashed circle before the first run, a speech bubble for a conversation the person started. Decoration: the text beside it says the same; sized by its parent's font. -->

<script lang="ts">
import type { PropType } from 'vue';

/**
 * `running` still runs; `started` started, whether it still runs unknown (its conversation is not at hand); `finished` ran and ended; `late` started after its time (piko was closed or the computer
 * asleep); `skipped` did not start because the previous run still waited; `failed` couldn't start; `notRun` has not
 * come yet; `person` is a conversation the person started, not a run.
 */
export type RunStatus = 'running' | 'started' | 'finished' | 'late' | 'skipped' | 'failed' | 'notRun' | 'person';

export const RunStatusIconProps = {
  status: { type: String as PropType<RunStatus>, required: true },
} as const;
</script>

<script lang="ts" setup>
import { CalendarX, CircleAlert, CircleCheck, CircleDashed, CirclePlay, MessageCircle, Moon } from '@lucide/vue';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { computed } from 'vue';

import Spinner from './Spinner.vue';

const props = defineProps(RunStatusIconProps);

const icon = computed(() => {
  switch (props.status) {
    case 'running':
      return null;
    case 'started':
      return CirclePlay;
    case 'finished':
      return CircleCheck;
    case 'late':
      return Moon;
    case 'skipped':
      return CalendarX;
    case 'failed':
      return CircleAlert;
    case 'notRun':
      return CircleDashed;
    case 'person':
      return MessageCircle;
    default:
      return assertNever(props.status);
  }
});
</script>

<template>
  <span :class="[$style.runStatusIcon, $style[`runStatusIcon_${props.status}`]]">
    <Spinner
      v-if="icon == null"
      color="inherit"
    />
    <component
      :is="icon"
      v-else
      :class="$style.runStatusIcon_icon"
      aria-hidden="true"
    />
  </span>
</template>

<style lang="scss" module>
.runStatusIcon {
  display: inline-flex;
  flex: none;
}

.runStatusIcon_icon {
  width: 1em;
  height: 1em;
}

.runStatusIcon_running {
  color: $color-link-ink;
}

.runStatusIcon_started {
  color: $color-link-ink;
}

.runStatusIcon_finished {
  color: $color-project-green;
}

.runStatusIcon_late {
  color: $color-project-amber;
}

.runStatusIcon_skipped {
  color: $color-attention-muted;
}

.runStatusIcon_failed {
  color: $color-attention;
}

.runStatusIcon_notRun {
  color: $color-ink-faint;
}

.runStatusIcon_person {
  color: $color-ink-muted;
}
</style>
