# Brand identity

piko's logo is the word "piko" with the mascot Piko as its "p"; Piko alone replaces the old agent mark (a sparkle on
a gradient tile). The vector sources are `docs/brand/piko-mark.svg` and `docs/brand/piko-wordmark.svg`; the code was
built first on this branch, and this round brings `piko.pen` in line with it. Base: `4a5c790`.

## Round 1 · agent brief

Asked (`.context/brand-brief.md`): a `piko` colour, Piko as `atoms/Agent mark`, a wordmark atom on light and on dark,
the wordmark on the first run's story panel.

Changed: Piko and the wordmark are `path` nodes that carry the SVGs' geometry exactly, each with the SVG's viewBox,
so they scale uniformly. The strokes of the letters are outlined into fills (round caps as arcs), since a path's stroke
width would not scale with its viewBox. Replacing the story panel's `Brand` row emptied the slot overrides of every
first-run screen; they were restored from the base revision with new ids for the restored nodes.

- [x] Variables: new `piko` = `#45C095`, not themed by `palette`.
- [x] `atoms/Agent mark` (`nyX3c`): gradient tile with a sparkle icon (30 × 30) → Piko, 24 × 30, paths `Body`
  (`$piko`) and `Eyes` (`$ink`); the icon `QBWSk` is gone.
- [ ] `organisms/Theme picker` header (`qaIjH`): the mark instance `XExiX` (48 × 48 tile, radius 15, icon 22) → `ZuCR1`,
  Piko 38.6 × 48 with its paths resized to match.
- [x] `atoms/Wordmark` (`fOS2H`): new in `Identity`, 68.8 × 32, paths `Body` (`$piko`), `Eyes` and `Letters` (`$ink`).
- [x] `atoms/Wordmark / on dark` (`s0qF0q`): new, an instance of `atoms/Wordmark` with `Letters` in `$on-ink`.
- [x] `templates/Split wizard shell` (`eGNnb`): the `Brand` row `FwjjA` (agent mark + text "piko") → `c2Ygp`, one
  instance of `atoms/Wordmark / on dark`, 111.8 × 52.
- [x] First-run screens 36, 38, 39, 40, 41, 44, 45, 50: the `Path` and `Step` slot contents restored as they were at the
  base (same content, new node ids).

The code was built before this round, so its entries are ticked; the theme picker has no component in code yet, so
its entry waits for it.
