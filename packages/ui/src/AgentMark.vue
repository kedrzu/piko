<!-- The agent's mark: Piko, the mascot drawn as the logo's "p" with two eyes. Decorative; the name beside it speaks. -->

<template>
  <svg
    :class="$style.agentMark"
    viewBox="0 71 237.2 295"
    aria-hidden="true"
  >
    <!-- The geometry of `docs/brand/piko-mark.svg`. -->
    <g :class="$style.agentMark_body">
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
    <g :class="$style.agentMark_eyes">
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
  </svg>
</template>

<style lang="scss" module>
.agentMark {
  display: block;
  flex: none;
  width: 24px;
  height: 30px;
}

.agentMark_body {
  fill: $color-piko;
}

.agentMark_eyes {
  fill: $color-ink;
}
</style>
