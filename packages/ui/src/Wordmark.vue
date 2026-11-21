<!-- The logo: the word "piko" with Piko as its "p". The letters take the text colour, so it reads on light and dark. -->

<script lang="ts" setup>
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';

import * as l from './Wordmark.loc.js';

const t = useTranslate();
</script>

<template>
  <svg
    :class="$style.wordmark"
    viewBox="0 0 787.2 366"
    role="img"
    :aria-label="t(l.name)"
  >
    <!-- The geometry of `docs/brand/piko-wordmark.svg`. -->
    <g :class="$style.wordmark_piko">
      <ellipse
        cx="118.6"
        cy="185"
        rx="118.6"
        ry="114"
      />
      <rect
        x="0"
        y="185"
        width="66"
        height="148"
      />
      <circle
        cx="33"
        cy="333"
        r="33"
      />
    </g>
    <g :class="$style.wordmark_eyes">
      <rect
        x="109.6"
        y="149"
        width="18"
        height="32"
        rx="9"
      />
      <rect
        x="154.6"
        y="149"
        width="18"
        height="32"
        rx="9"
      />
    </g>
    <g :class="$style.wordmark_letters">
      <line
        x1="294.2"
        y1="109"
        x2="294.2"
        y2="261"
      />
      <circle
        :class="$style.wordmark_dot"
        cx="294.2"
        cy="33"
        r="33"
      />
      <line
        x1="386.2"
        y1="33"
        x2="386.2"
        y2="261"
      />
      <line
        x1="434.2"
        y1="185"
        x2="511.2"
        y2="108"
      />
      <line
        x1="434.2"
        y1="185"
        x2="511.2"
        y2="262"
      />
      <circle
        cx="673.2"
        cy="185"
        r="81"
      />
    </g>
  </svg>
</template>

<style lang="scss" module>
.wordmark {
  display: block;
  width: auto;
  height: 32px;
}

.wordmark_piko {
  fill: $color-piko;
}

.wordmark_eyes {
  fill: $color-ink;
}

.wordmark_letters {
  fill: none;
  stroke: currentcolor;
  stroke-width: 66;
  stroke-linecap: round;
}

.wordmark_dot {
  fill: currentcolor;
  stroke: none;
}
</style>
