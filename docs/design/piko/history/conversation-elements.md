# Conversation elements

The interactive pieces the agent shows inside its reply — choices and small forms first (generated UI,
[D23](../DECISIONS.md#d23)), later an approval, a browser handoff — designed as one language so later elements are
assembled from the same parts. The rules are written up in [ui/conversation-elements.md](../ui/conversation-elements.md).
Base: `7b4778c`.

## Round 1 · agent brief

Asked (`.context/conversation-elements-brief.md`): one visual language for elements inside a conversation; components
for the generated-UI library (text, choices, form, single-line and multi-line fields, select, checkbox group) in their
states (active, appearing, answered, invalid); screens in App setup's onboarding; open questions as variants. The first
code (built before the design) was the starting point.

Changed: components in new `Conversation elements` rows and column, screens 67–71, two variant frames. Decisions the brief
left open:

- **The card** is `surface-soft`, `radius-l`, 16 px padding, white controls inside — the language of the existing
  `Choice card` and `Batched approval`.

- **Answered:** the card loses its fill (white, `border` outline), controls disabled, text `ink-muted`.

- **Appearing:** controls disabled until the reply ends; the actions row comes last; the writing caret inside the card.

- **Optional is marked, not required:** "(opcjonalnie)" in an optional field's label, no asterisk.

- **Checkbox options** are full-width white rows, 40 px, clickable whole; in error they take `attention-border`, not
  `attention`, so five rows do not shout.

- **Equal choices are all secondary;** primary is for the suggested answer and a form's send button.

- **The composer's placeholder** beside an element: "Albo odpowiedz własnymi słowami…".

- [x] Variable `attention-ink`: `#C2492A` → `#B5401F` (error text on `surface-soft` was 4.46:1; also lifts it on
  `attention-soft`, 4.2:1 before).

- [x] `atoms/Checkbox/On` (`kSEU3`): fill `$brand-1` → `$brand-1-strong` (2.5:1 in lemonade).

- [x] `atoms/Checkbox/Off` (`NdtHU`): stroke raw `#C5CBC4` → `$ink-faint`, fill `$surface`.

- [x] Atoms › `Conversation elements` (`R90Z7`): new `Checkbox/On/Disabled` (`V3ADI`), `Checkbox/Off/Disabled`
  (`JNXSi`), `Button/Secondary/Disabled` (`idphP`), `Button/Chosen` (`SKL2S`), `Writing caret` (`vLxz0`).

- [x] Molecules › `Forms`: new `Text field/Filled` (`y8yDx4`), `Text field/Disabled` (`FkMqR`).

- [x] Molecules › `Conversation elements` (`j9vNy`): new `Text area` (`z5qQb`; Filled `H3Z30X`, Error `RaIVY`, Disabled
  `qFT91`), `Select` (`kg9it`; Filled `MtzD3`, Error `UXVRW`, Disabled `NKKzC`), `Checkbox option` (`xHghk`; On
  `dAkjc`, Error `A0Yfia`, Off/Disabled `niZND`, On/Disabled `k9bIfF`), `Checkbox group` (`D3ym5`; Filled `BGA9J`,
  Error `pJEWy`, Disabled `u3rLui`), `Choices` (`p33O1`; Appearing `KEDy9`, Inactive `Db5kX`), `Form actions`
  (`sxvGY`; Disabled `K9hfE`).

- [x] Organisms › `Conversation elements` (`gRABZ`): new `Conversation element` (`I1g3lZ`) and `/Inactive` (`tvV1a`),
  `Form` (`Z04uYV`), `/Error` (`P0hVD`), `/Appearing` (`BzLij`), `/Inactive` (`gqFKU`).

- [x] 67 Conversation · the agent offers choices (`zR3Ak`): new; App setup, three secondary choices bare under the text.

- [x] 68 Conversation · a form (`A1oYCo`): new; the answered choice above, then a card with "Czym mam się zająć?" (five
  checkbox rows), "Coś jeszcze? (opcjonalnie)" and *Wyślij*.

- [x] 69 Conversation · a form with an empty required field (`v6JUW`): new; 68 after *Wyślij*, the group in error with
  "Uzupełnij to pole", scrolled to the end.

- [x] 70 Conversation · an element appearing (`qroPO`): new; the form half built, the caret in the card, spinners on the
  conversation row and tab as 56.

- [x] 71 Conversation · answered (`v21QU`): new; 67 after a click, the element inactive, the person's message below,
  the agent writing.

- [x] `Atoms` (`R3GuU`), `Molecules` (`yh5Lh`): moved y −1400 → −2590; `Organisms` (`M1u0SQ`): −848 → −1698 (room for
  the new rows).

## Round 2 · owner's decisions, agent brief

Asked (`.context/conversation-elements-brief-2.md`): the owner picked Variant A in both frames — simple choices bare
under the text, the picked choice keeps a check — kept "(opcjonalnie)", and asked for the field outline's contrast to be
fixed now (`$border-strong` on white was 1.25–1.37:1, controls need 3:1).

- [x] 72 · Conversation · simple choices bare under the text (`I4a8W`): moved out of its variant frame beside 71;
  `Variant A ·` dropped. Variant B (73, `nBG22`) and the frame (`bFfWw`) deleted.
- [x] 74 · Conversation · the picked choice keeps a check (`hVbB5`): moved out beside 72; `Variant A ·` dropped.
  Variant B (75, `vjjBA`) and the frame (`ykkkU`) deleted.
- [x] Variable `field-border` `#7A827C` (new, same in every palette): 3.95:1 on white, 3.61:1 on `surface-soft`, ≥3.03:1
  on each palette's `bg-1`.
- [x] Text field input (`hMaDU`), text area (`ZuqMg`), select (`qBWjC`), code field (`uzRCt`): stroke `$border-strong`
  → `$field-border`.
- [x] `atoms/Checkbox/Off` (`NdtHU`): stroke `$ink-faint` → `$field-border` (2.78:1 on `surface-soft`).
- [x] `molecules/Color field` (`Y9hEe`): stroke `$border` → `$field-border` (a select-like control, ~1.2:1).
- Not changed, on purpose: the checkbox *row* outline stays `$border-strong` (the box carries the 3:1, a second dark
  outline was heavy); the composer, buttons and cards keep their outlines.

Open: 72 and 74 are titled with a dot after the code (`72 · …`) while 67–71 are not (`67 Conversation · …`).

## Round 3 · implementation

Forced by accessibility and by states the drawings leave open, while building the generated UI (no node changed yet):

- [ ] Disabled button text (`idphP`, `K9hfE`) and a disabled field's value (`qFT91`, `QD13X`): `$ink-faint` (3.0:1) →
  `$ink-muted`, readable while disabled.
- [ ] `organisms/Conversation element` paragraph (`I1g3lZ`): no library component puts `Text` inside a `Form`, so text
  always stands bare in the agent's text style; the card paragraph style is unused for now.
- [ ] The writing caret beside bare choices (not drawn; `BzLij` shows it only in a card): on its own line under the
  appearing row of buttons.
- [ ] A required checkbox group is no longer announced as required (a `group` takes no `aria-required`, and the
  asterisk's hidden text went with it); it follows from the absence of "(opcjonalnie)".
