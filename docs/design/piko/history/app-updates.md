# Toasts and the app update

The installed desktop app updates itself from builds of `main` (the Development stream): it checks every few minutes,
downloads and installs a new version in the background, then offers a restart. Nothing restarts on its own; quitting
and reopening also starts the new version. The offer is a **toast**, the first in piko, so the toast is drawn
as a general design-system component that later features reuse (a background task finished, something failed, an
Undo), and the update toast as its first use. Base: `e3053e6`.

## Round 1 · agent in the app

Asked (`.context/app-updates-brief.md`): `molecules/Toast` with tones, lifetimes, with and without actions and long
text; `molecules/Toaster`; the update toast ready, restarting and install failed; screens 67–69 on 54's shell, in
Meadow, with the components checked in Sunset and Lemonade.

Changed: a `Toasts` column in Molecules, one button atom, three screens. Decisions the brief left open:

- **The tone lives in the leading icon tile** (`atoms/Icon tile`), the card itself stays `$surface` with `$border` in
  every tone: neutral is a `$surface-soft` tile with an `$ink-muted` icon, warning an `$attention-soft` tile with an
  `$attention-ink` icon, accent a solid `$brand-1-strong` tile with an `$on-ink` icon, so news worth acting on stands
  out more than an outcome. `$brand-1` was not used: in Lemonade it is 2.5:1 on white. No variable was added.

- **Contrast** (on `$surface`): title `$ink`, description `$ink-body`, both above 7:1 in every palette; icons:
  `$ink-muted` 5.9:1, `$attention-ink` 4.9:1 (about 4.2:1 on its soft tile), `$on-ink` on `$brand-1-strong` 4.9–5.3:1
  across the palettes.

- **No small button exists,** so the toast's action is the regular 32 px `atoms/Button/Primary`; the toast reads fine
  with it. The update's *Uruchom ponownie* and *Spróbuj ponownie* are Primary with `rotate-cw`; the Undo example
  (*Cofnij*) is Secondary.

- **The busy state is a new atom,** `atoms/Button/Primary/Busy` (`loader-circle` in place of the icon). Restarting
  says *Uruchamiam ponownie…* on the busy button; the disabled × is `$border-strong`.

- **The timed ring** is a 2 px `$border` track with an `$ink-muted` arc from the top, clockwise, two-thirds left, around
  the ×. The × sits in a 30 px box so it centres on the icon tile.

- **The shadow** is the composer's, made a little deeper because the toast floats: `#1D23200F` 0/1/3 plus `#1D23201F`
  0/10/28 (raw colours, as the composer's shadow already has).

- **A version string never breaks.** The drawing uses a non-breaking hyphen (`0.1.0‑dev.215`); the code should keep
  the version on one line (`white-space: nowrap` on it) rather than copy the character.

- **The update toasts are components** (`molecules/Update toast/*`, instances of `molecules/Toast/Accent` and
  `/Warning`), so the copy lives once; the screens and the Toaster instance them.

- **Placement:** the toast's right and bottom edges are 24 px inside the main card (x 1046, bottom at 866 on a
  1440×900 window), far from 54's centred composer.

- **Molecules moved up** 211 px (y −1400 → −1611) so its taller Columns don't overlap Organisms and `Daily work ·
  components`.

- [x] Buttons atoms (`J5r3E`): new `atoms/Button/Primary/Busy` (`QarYo`), an instance of `atoms/Button/Primary`.

- [x] Molecules (`yh5Lh`): y −1400 → −1611; new `Toasts` column (`mSf7U`) at the end of Columns.

- [x] `molecules/Toast` (`TLpt4`): new base, neutral and pinned; tone icon tile, title, description, hidden Actions
  row with one button, dismiss × with a hidden countdown track and ring.

- [x] `molecules/Toast/Accent` (`uT2nm`), `molecules/Toast/Warning` (`y1Drq`), `molecules/Toast/Timed` (`qrTV6`):
  new variants, instances of the base.

- [x] Toasts column examples: `Toast · neutral, timed, with action` (`tnRI8`, *Cofnij*), `Toast · long text`
  (`DCsX7`, two-line title, three-line description).

- [x] `molecules/Update toast/Ready` (`rqFEE`), `/Restarting` (`F3UjV0`), `/Install failed` (`cA8FC`): new.

- [x] `molecules/Toaster` (`Cu2AE`): new; a timed *Projekt „Faktury” utworzony* above the Ready toast, gap 8.

- [x] `67 Update · ready to restart` (`YHdki`), `68 Update · two toasts at once` (`xeqJ5`), `69 Update · install
  failed` (`UvpN1`): new screens in a row under 63–66; each is 54's shell (copied) with the toast or the Toaster over
  the card's bottom-right corner.

## Round 2 · implementation

Built in `packages/ui` (`Toast`, `Toaster`, `UpdateToast`) and mounted in `packages/app/app.vue`. No design change was
needed. Differences in the code, small enough to leave the drawing as it is:

- The toast title's line height is `$line-height-snug` (1.4) where the drawing has 1.35.
- The × gets a `$surface-soft` background on hover, which the drawing does not show.
- Restarting shows `Button`'s own busy spinner rather than the `loader-circle` of `atoms/Button/Primary/Busy`.

## Round 3 · merge with main

Conflict: both sides moved Molecules (`yh5Lh`) up as it grew — here to y −1611, on main (#38) to −2590, level with
Atoms. Resolved to −2590: the merged frame is 837 px tall, so it ends at −1753, clear of Organisms at −1698.

- [x] Molecules (`yh5Lh`): y −1611 → −2590.
