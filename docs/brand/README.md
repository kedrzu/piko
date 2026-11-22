# Brand

The logo is the word "piko", lowercase, with the mascot Piko as its "p": the letter's bowl is Piko's head, the stem
its body, and two upright eyes look toward the rest of the word.

## Sources

The SVGs here are the sources; everything raster is rendered from them.

- `piko-wordmark.svg` and `piko-wordmark-on-dark.svg`: the logo on light and dark backgrounds.
- `piko-mark.svg`: Piko alone.
- `piko-app-icon.svg`: the app icon on the macOS grid (an 824 px tile on a 1024 px canvas).
- `piko-app-icon-small.svg`: the same icon with larger eyes, used at 32 px and below, where the regular eyes blur
  away.

The lettering is drawn on one grid: baseline 294, x-height 76, ascender 0, descender 366, every stem 66 wide; the
round shapes overshoot the baseline and x-height by 5. The UI draws the same geometry in `AgentMark.vue` and
`Wordmark.vue` (`packages/ui`), so a change to the shapes is made there too.

## Colours

- Piko's mint `#45C095`, the same in every palette (`$color-piko` in the UI's tokens).
- Ink `#1D2320` for the letters and the eyes, paper `#FAF8F3` for Piko on the icon and the letters on dark.

## Rendering

`bun run icons` (`scripts/generateIcons.ts`) writes, from the sources:

- the desktop app's icons in `packages/desktop/src-tauri/icons/` (PNGs, `icon.icns`, `icon.ico`);
- the favicon in `packages/app/public/` (`favicon.svg`, `favicon.ico`);
- PNGs of the icon (16 to 1024 px) and of Piko (64 to 512 px tall) in `png/`.

The outputs are committed; run the script again after changing a source.
