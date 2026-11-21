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

## Round 4 · agent brief

Asked (`.context/structured-answers-brief.md`): answers to a form are kept as structured data now, so draw side by side
how an answered form shows in the conversation, on a three-field form (checkbox group, select, long text area).

Changed: a read-only "filled" state for every field (the disabled ones show values faint), two answer-bubble
components, and a variant frame beside 74. Decisions the brief left open:

- **Answered fields:** the controls keep their disabled look (`surface-soft`, `border`), labels `ink-muted`, values
  `ink`; a picked checkbox keeps its brand check, unpicked rows stay `Off/Disabled`; the send button keeps its check
  (`atoms/Button/Chosen`), *Pomiń* stays disabled.

- **Variant B's authorship:** "Twoja odpowiedź" with a `user-round-check` icon on top of the card, plus the checked send
  button.

- **Variant C's bubble** drops "(opcjonalnie)" from the labels; a picked option is a check and its text, not a chip.

- **Variant D** replaces the button's message with the count, outlined and muted, no fill.

- [x] Molecules › `Conversation elements` (`j9vNy`): new column `Answer bubbles` (`wLxGx`) with `Answer` (`Q70ei`,
  label over value), `Answer/Picked` (`fvjgb`) and `User message/Answers` (`pdwue`), the parts of Variant C's bubble.

- [x] New `78 · Variant C · Form collapses, answers in a structured bubble` (`RpGVt`), in a variant frame beside 74
  with Variants A, B, D (76, 77, 79, 80); round 5 settled it.

Variants A, B and D, their frame and the components drawn only for them (the answered states of the fields, checkbox
option and group, select, text area and form actions, `organisms/Form/Answered`, `User message/Summary`) and the
120 px shift of `Templates` were deleted in round 5 before anything was built, so they have no entries.

## Round 5 · owner's decision, agent brief

Asked (`.context/structured-answers-brief-2.md`): the owner picked Variant C, with one change: the answered form is not
shown at all. Once sent, it collapses (animated in the app) and the person's structured bubble takes its place; the
agent's reply keeps only its text. A bare row of choices still stays as 74. The bubble was to be polished: the
person's own message style, labels clearly secondary, calm spacing, no boxes inside.

Decisions the brief left open:

- **The bubble's width** is the column's 85% (578 px), fixed in the component, because a free-text answer wraps; in
  the app it hugs shorter content like any user bubble.

- **Type:** every value at the user message's 15 px `ink`; labels 13 px, weight 500, `ink-muted` (5.3:1 on
  `surface-soft`). Label to value 2 px, between picks 2 px, between questions 14 px.

- **A pick** is a 15 px `check` in `brand-1-strong` (4.4–4.8:1 on `surface-soft` across the palettes), top-aligned to
  the first line so a wrapped option stays readable.

- **78 shows the flow on:** an introducing agent paragraph above the question, and the agent writing its next reply
  below the bubble, as 71.

- [x] Molecules › `Answer bubbles` (`wLxGx`): width 480 → 680 (the conversation column), gap 16 → 24; new
  `molecules/Picked option` (`CtNa0`): check and text, one per picked option.

- [x] `molecules/Answer` (`Q70ei`): gap 3 → 2; label (`qUCeP`) 12.5 px/600 → 13 px/500, line height 1.4 → 1.45; value
  (`yWoYt`) 14.5 → 15 px.

- [x] `molecules/Answer/Picked` (`fvjgb`): the single check row (`sQbxD`) → `Picks` (`VFcWM`), a vertical slot of
  `Picked option`s, 2 px apart.

- [x] `molecules/User message/Answers` (`pdwue`): bubble (`RYZ5h`) width 440 → 578; answers (`MP3Wa`) gap 12 → 14.

- [x] 78 · Conversation · an answered form becomes the person's structured message (`RpGVt`): out of the variant frame
  to the root beside 74 (x 3900), caption slot dropped, `Variant C ·` dropped; the inactive form removed from the
  agent's reply; an introducing paragraph above "W czym chciałbyś mieć pomoc?"; the agent's next reply writing below
  the bubble; the conversation starts at the top (as 71), not scrolled to the end.

- [x] New 81 · Conversation · structured answer with several picks (`dDGf9`), right of 78: 78 with three picked
  options and the long free-text answer that was 80's.

- [x] [ui/conversation-elements.md](../ui/conversation-elements.md): "Answered" and "What an answer looks like" say an
  answered form collapses into the person's structured bubble.

## Round 6 · owner's feedback, agent brief

Asked (`.context/structured-answers-brief-3.md`): the bubble's first line on 78 and 81, "Oto, w czym chciałbym
pomocy", was the hidden message of the form's send button: the person never saw it in the form, so it surprised them.
The bubble shows exactly what the form showed and what the person entered, nothing else. A screen for a form with two
buttons, skipped with nothing filled.

Decisions the brief left open:

- **The bubble's padding** stays 12/16/14/16: with the small label on top, the top and the bottom read balanced.

- **The clicked button's label** stays in the component as a hidden `Button label` after the answers, 16 px below them,
  in the message's 15 px `ink`; a screen turns it on when the rule calls for it.

- **With nothing filled** the bubble is the plain `molecules/User message`, hugging its text, not the 578 px structured
  bubble.

- [x] `molecules/User message/Answers` (`pdwue`): the first line, the button's message (`W2q6HS`), moved after the
  answers and renamed `Button label`, hidden by default, content "Wiadomość przycisku" → "Pomiń na razie"; the bubble
  starts with the first answer.

- [x] 78 (`RpGVt`), 81 (`dDGf9`): the override "Oto, w czym chciałbym pomocy" removed; the bubble instances replaced
  to drop it (now `rOK0m`, `tPJEU`), answers unchanged.

- [x] New 82 · Conversation · structured answer with the button that sent it (`uYotE`), right of 81 (x 6940): 78's
  question, the person's bubble "Pomiń na razie", the agent writing on ("Jasne, wrócimy do tego, kiedy zechcesz. Na
  razie").

- [x] New `82 · Caption` (`Z8omms`) under 82: what happened and the rule — the clicked button's label shows only when
  it was not the form's first button (the default send) or no field was filled, after the answers.

- [x] [ui/conversation-elements.md](../ui/conversation-elements.md): "What an answer looks like" — no hidden message in
  the bubble, the rule for the button's label; "Answered" cites 82.

Settled after the round (implementation): the rule was "more than one button", which would end 78 and 81 (a form with
*Wyślij* and *Pomiń*) with "Wyślij", a word that adds nothing. It is now "not the form's first button, or nothing
filled", so 78 and 81 stand as drawn.

## Round 7 · implementation

Built rounds 4–6 (#84) and ticked their entries. Where the code differs from the drawings:

- [ ] Labels in the person's structured bubble read as the form showed them; round 5's "labels drop (opcjonalnie)" is
  not built — the agent writes the labels, and the bubble shows nothing the form did not.
- [x] A row of choices answers with its button's label (no hidden message, D23): screen 74's bubble already reads as
  the picked button's label ("Dom i dzieci"); nothing to redraw.
- [ ] The form's collapse animates its height (nzyme `Reveal`), also under reduced motion: `Reveal` has no
  reduced-motion switch yet.
