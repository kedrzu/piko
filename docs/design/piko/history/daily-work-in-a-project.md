# Daily work in a project

The everyday loop of [the brief](../ui/daily-work-in-a-project.md): open the app, see what's waiting, work with the
agent in a project, approve, step in for the agent's browser. Base: `ad824bf`.

## Round 1 · agent in the app

Asked: design every screen of the brief afresh, with variants wherever the design can go several ways, the existing
screens included.

Changed: screen 11 finished (it had only a header); seven new screens for the states and failures the brief lists
and nothing drew; five `Variants · …` frames (19–33), settled in round 2.

- [ ] Daily work · components (`C1PeFe`): new `Row 3` with `molecules/Filter chip` (`HyXbi`),
  `molecules/Filter chip/On` (`zX8Re`), `molecules/History row` (`sdDvl`), `molecules/Sheet row` (`TG3R9`).
- [x] 11 Project · all conversations (`MN3wL`): header only → filters (All, Started by you, one chip per schedule)
  and the history in `This week` / `Earlier`, scheduled runs marked, the skipped and the late run shown.
- [ ] 12 Project · empty (`bFs1b`): new; composer in the middle, three starter suggestions, drop files.
- [ ] 13 Conversation · the agent's computer is waking up (`J5p5m`): new; `Status banner` above the composer.
- [ ] 14 Conversation · signed out of the AI provider (`LOJI7`): new; amber banner with Sign in, the unanswered
  message marked, first Waiting item says it.
- [ ] 15 Conversation · subscription limit reached (`NgOhu`): new; when it resets, schedules that wait, See plans.
- [ ] 16 Conversation · a connected account stopped working (`S0qTs`): new; reconnect card listing what waits.
- [ ] 17 Deleting a project that schedules depend on (`eLjqw`, the shell inside is `zKVPK`): new; dialog naming the
  schedule and the plugin that stop, with Pause instead. Centred on the whole window over a light frosted scrim
  (`$surface-glass` with a background blur) covering the sidebar too; the dialog has a soft shadow and a `$border`
  stroke (owner: the dark scrim over the main card only didn't fit the light design).
- [ ] 18 Project files · a spreadsheet preview (`qNQte`): new; read-only sheet preview with Open in Numbers.

## Round 2 · owner's picks

Asked:

- Sidebar signal: keep the card of three (variant B, today's design).
- Scheduled conversation: the header (variant A), with buttons that look like buttons and sit closer together.
- Files: in the sidebar under the project (variant C), plus the side view of variant B for a file that comes up in
  a conversation, expandable to a full tab.
- Memory: a misunderstanding. Memory is plain Markdown files shared by the profile, with no structure of its own; the
  design docs are corrected where they suggested otherwise.
- One file, two editors: the agent waits (variant A), but only while she is actually editing, not because the file
  is open.

Changed: the variant frames are gone (git history keeps them); the picks became the design of the existing screens.

- [ ] `organisms/Sidebar` (`LdqnM`): `Projects` (`bSPlA`) fills the height and clips (the list scrolls), the `Flex`
  spacer removed; Memory nav item (`vRDAC`) `About you` / `heart-handshake` / `12 notes` → `Memory` / `brain` /
  `6 files`, per D9.
- [ ] `molecules/Nav item` (`k6dG9`): default label `About you` → `Memory`.
- [ ] `organisms/Tab bar` (`osLpo`): `Project files` button (`n7BC6u`) hidden; files live in the sidebar.
- [x] `molecules/Run header` (`e3sGdM`): new; schedule name, due and ran times, why late, `All runs` and `Schedule`
  as secondary (outlined) buttons 6 px apart. Replaces `molecules/Run marker` (`X6xelD`, deleted) in the three
  Main screens, `13` and `16`.
- [ ] `molecules/Sidebar label` (`GHAlZ`): new; `Conversations` / `Files` labels inside an open project.
- [ ] `molecules/File chip` (`PIOhS`): new; a file named in a conversation, opens it in the side view.
- [ ] 02 Day one · getting to know you (`j0A6R`): `About you` → `Memory` in the agent's message and the note chip.
- [ ] 06 Project files · agent editing an open file (`f57BOY`): right-hand files panel removed; the open project in
  the sidebar lists conversations and files, `Post ideas` selected with a writing icon; list shown scrolled.
- [ ] 07 Memory · what the agent knows about you (`YkyFt`, was `07 About you · …`): topics view → the Memory page:
  a short framing line and its six files with who changed them last; the files listed under Memory in the sidebar.
- [ ] 08 File changed by both you and the agent (`x3iJgo`): deleted, variant B rejected.
- [ ] 12 Project · empty (`bFs1b`): lede points to the sidebar instead of Project files.
- [ ] 18 Project files · a spreadsheet preview (`qNQte`): files panel removed; files in the sidebar,
  `Followers 2026.xlsx` selected.
- [ ] 26 Conversation · a file open beside it (`Zfrjz`): new, from variant B; chat on the left with a `File chip`,
  the file on the right with `Open as a tab` and close.
- [ ] 31 Project files · the agent waits while you edit (`FsnNu`): new, from variant A; banner says the agent holds
  its change because she is typing, and that an open file alone doesn't stop it; files in the sidebar.
- [ ] 34 Memory · a note open (`dJbK5`): new; a Memory file in the editor, the agent's latest line marked.
- [ ] Daily work · components: `organisms/Files panel` and `molecules/Learned fact`, added in round 1, deleted
  unused.

Open: with the card of three, an open project's conversations and files don't fit in a 900 px window, so `06`,
`18`, `26` and `31` show the project list scrolled. Not done: `10 Schedule · its runs` still draws its run rows by
hand; they should become `molecules/History row`.

## Round 3 · owner in the app

Asked: the agent's block in `06` (`Idea 4`, `t4dK8d`) has its own padding and background, so its text no longer lines
up with the rest; Markdown has many kinds of blocks, so the mark for "the agent changed this" has to be generic.

Changed: a variants frame; the screens keep the old mark until the owner picks.

- [ ] Variants · How a file shows what the agent changed (`q2cRc2`): `35` A a bar in the left margin beside every
  changed block (recommended), `36` B the bar plus who and when in the right margin, `37` C the changed text tinted
  in the brand colour.

## Round 4 · owner in the app

Asked: banners (`Agent editing banner` in `31`, `V581f`) need no border; their buttons should match the banner,
lighter than it, and the buttons keep a border. Applied to every tinted banner, not only the one pointed at.

- [ ] Atoms · Buttons (`J5r3E`): new `atoms/Button/On tint` (`Nle7R`, Secondary with a `$surface-glass` fill) and
  `atoms/Button/On tint/Attention` (`qgvOv`, its border `$attention-border`, label and icon `$attention-ink`).
- [ ] `molecules/Status banner` (`YTm72`): its button's fill `$surface` → `$surface-glass`.
- [x] `molecules/Run header` (`e3sGdM`): `All runs` and `Schedule` → `atoms/Button/On tint`.
- [ ] `organisms/Browser handoff` (`h1HlE`): border removed; fill `#FDF0EA` → `$attention-soft`; `Open the agent's
  browser` solid Attention → `On tint/Attention`; `Done, continue` fill → `$surface-glass`; raw colours of the
  thumbnail border and the instruction → `$attention-border`, `$ink-body`.
- [ ] Borders removed from `Agent editing banner` in `06` (`dNLp1`), `26` (`e5GcU`), `31` (`V581f`) and from
  `Reconnect card` in `16` (`GVFMh`).
- [ ] `14` Sign in to ChatGPT, `15` Remind me at 14:00, `16` Reconnect Google: solid Attention / Secondary →
  `atoms/Button/On tint/Attention`.

## Round 5 · owner's pick for marking agent changes

Asked: none of `35`–`37`; do it the way Pen shows its agent: a cursor where the agent is working, and the blocks it
changed lit for a while, fading so the most recent stand out. No words saying the agent wrote it. The highlight
attaches to the nearest node of the Markdown AST (a paragraph, a heading, a list item).

Changed: the variants frame (`q2cRc2`) deleted; the pick drawn into the screens.

- [ ] `molecules/Agent cursor` (`BtOTy`): new; a brand caret with a small flag in the agent mark's gradient.
- [ ] `atoms/Change highlight` (`lns0L`): new; brand-tinted rounded rectangle drawn behind a changed node, 12 px
  wider on each side and 6 px taller, so the text never moves; its opacity says its age (0.16 just now, fading to
  none).
- [ ] 06 (`f57BOY`) and 26 (`Zfrjz`): `Idea 4` loses its fill, padding and `Agent` tag; the caret → `Agent cursor`;
  highlight 0.16 behind it; `Idea 2`'s paragraph highlighted at 0.06 (changed a minute earlier).
- [ ] 34 Memory · a note open (`dJbK5`): the agent's line from yesterday loses its box and its "The agent added
  this" tag; its highlight has faded out.

## Round 6 · owner in the app

- [ ] `molecules/Agent cursor` (`BtOTy`): flag 15 → 20 px, its icon 9 → 13 px.
- [ ] Format bar in `06`, `26`, `31` and `34`: the `Saved · …` status text removed (owner: not needed; saving is
  automatic, and the banner already says when the file is read-only).

## Round 7 · owner in the app

Asked: one schedule icon everywhere, the run header included; in the sidebar it goes after the conversation's name.

- [ ] Schedule icon `repeat` → `calendar-clock` (the Schedules nav item's icon) everywhere: `molecules/Run header`
  tile, `molecules/History row` chip, `molecules/Filter chip`, tabs of scheduled conversations, `16`'s reconnect
  card.
- [x] `molecules/Conversation row` (`lpPvh`): new `Schedule` icon (`g1fOgp`) after the label, hidden by default; the
  leading `Icon` default `repeat` → `message-circle`. Scheduled rows (LinkedIn check, Weekly stats, Morning
  routine, Sort my email) hide the leading icon and show the trailing one, in `organisms/Sidebar` and every screen.
- [ ] Sidebar overrides of every screen rebuilt (an override on a template row had wiped them mid-round; rebuilt
  from the last saved file with the same content).

## Round 8 · agent brief (schedules, #28)

Asked: make `09` and `10` buildable: show only the data a schedule and its runs have (name, project, `when`, prompt,
paused, next term; per run its term, when it was handled, started / skipped / failed, late, still running), draw the
inline editing and the states. Removed everything the product doesn't have: per-run summaries, "Waiting for you" as a
run state, plugin and account lines, per-schedule icons, the description line, "Ask for a new schedule".

Changed: the schedule row and a new switch atom are components; `10` draws its runs as `History row` instances; six new
screens.

- [x] Daily work · components (`C1PeFe`): new `Row 4` (`R8WApW`) with `atoms/Switch/On` (`vyJn4`), `atoms/Switch/Off`
  (`cAyC4`, an instance of On), `molecules/Schedule row/Paused` (`Ty0dF`) and `molecules/Text area/Filled/Grows`
  (`q3y33O`, the text area whose input grows with the prompt, `fit_content(104)`); `molecules/Schedule row` moved
  into Row 4.
- [x] `molecules/Schedule row` (`PnF9h`): `Subtitle` removed; tile project colour and per-schedule icon →
  `$link-soft` / `calendar-clock` / `$link-ink`; `When` 150 → 210 px; `Last run` 200 → 220 px and vertical: `Status`
  (status icon + "Done · today 8:00") over `Next` ("Next: tomorrow 8:00", 12 px `$ink-faint`); hand-drawn `Toggle` →
  `atoms/Switch/On`; width 1000 → 1034.
- [x] `molecules/Schedule row/Paused` (`Ty0dF`): tile, name, project, when and status at 0.5 opacity; `Next` →
  "Paused" (`$ink-body`, 600); switch → `atoms/Switch/Off`.
- [x] 09 Schedules (`D7r3x`): rows rebuilt as eight `Schedule row` instances, one per last-run state: still running,
  ran late, skipped, done, couldn't start (`$attention-ink` label), not run yet, "No more runs", paused. Status icons:
  `loader-circle` `$link-ink`, `moon` `$project-amber`, `calendar-x` `$attention-muted`, `circle-check`
  `$project-green`, `circle-alert` `$attention`, `circle-dashed` `$ink-faint`. Column `What it does` → `Name`, widths
  follow the row. `Ask for a new schedule` hidden. Lede → "…in every project. Open one to see its runs and change
  it." Notes reworded: late = runs once when piko is back for the latest missed time; skipped = the previous run
  still waited (the "shows in Waiting for you" clause dropped). Table radius 16 → `$radius-l`.
- [x] 10 Schedule · its runs (`G1Wg0U`): tab icon `mail` → `calendar-clock`, its needs-you dot hidden; header tile →
  `calendar-clock` on `$link-soft`; meta → "Runs in" + project folder + `Email` as a link; toggle → `atoms/Switch/On`;
  new `Delete` (`atoms/Button/Ghost`, `trash-2`). Runs → seven `molecules/History row` instances (still running, late,
  skipped, done, couldn't start, done, done); skipped and failed runs hide the chevron (no conversation). How it runs:
  `Change` → `Edit`, the prompt as several lines, `Runs in` shows the project with its folder and loses `Open project`,
  `Needs` and the reconnect warning removed. List and panel radius 16 → `$radius-l`.
- [x] 11 Project · all conversations (`MN3wL`): the waiting row (`UBkxZ`) → `LaLWi`, an ordinary finished run ("3 new
  roles to look at", Today 7:00, no highlight, no dot); skipped row meta → "The previous run was still waiting for
  you"; late row meta → "Due 7:00 · started 9:13", time 9:14 → 9:13.
- [x] 75 Schedule · editing (`H0Y0UY`): new; 10 with How it runs as a form: Name (`Text field/Filled`), What it does
  (`Text area/Filled/Grows`), Repeat (`Select/Filled`: Every day / Weekdays / Every week on / Every month on day) and
  Time in a `Day and time` row (Day appears there for weekly and monthly), Runs in read-only, `Form actions` Save and
  Cancel.
- [x] 76 Schedule · a rule the picker can't show (`GUVm0`): new; When read-only ("Every day at 8:00 until 31
  December") with the hint "This schedule repeats in a way you can't set here. Ask the agent in Email to change it."
- [x] 77 Schedule · couldn't save (`DaeZG`): new; Every week on Sunday at 2:30, the daemon's error under the form
  (`$attention-ink`, `circle-alert`): the time doesn't exist on the night the clocks go forward.
- [x] 78 Schedule · delete? (`gZAuG`): new; 10 under the frosted scrim of `17`, dialog "Delete Sort my email?": its
  run history is deleted, the conversations stay in Email; Cancel and Delete schedule (Attention).
- [x] 79 Schedules · none yet (`B4HaS`): new; 09 without table or notes; centred `calendar-clock` tile, "No schedules
  yet" and how the agent creates one when asked in a project, with an example. No button.
- [x] 80 Schedule · gone (`vTtee`): new; 10's breadcrumb and tab, "This schedule is gone", the conversations stay in
  Email, a "Back to Schedules" link.

Open: `Runs in` has no Edit: the brief's edit form doesn't change the project, so the link would lead nowhere. The
unused specimen `History row · scheduled, needs you` (`I2tLO`) and the sidebar's "Routine skipped today" waiting item
still draw the removed waiting signal; they belong to the task that brings it back. `11`'s late row keeps its title
"Ran late · 1 new role" (the brief only changed its second line).

## Round 9 · implementation (schedules, #28)

Asked: bring `09`–`11` and `75`–`80` in line with the built screens. Forced by the accessibility tests (contrast, target
size) and by data the app doesn't have (whether a run waits for an answer, whether another project's run still runs,
message counts), or approved by the owner.

- [x] `molecules/Schedule row` (`PnF9h`): default status `circle-check` `$project-green` "Done · today 8:00" →
  `circle-play` `$link-ink` "Started · today 8:00" (the app can't tell a finished run from one still running elsewhere);
  `Next` `$ink-faint` → `$ink-muted` (contrast under 4.5:1).
- [x] `molecules/Schedule row/Paused` (`Ty0dF`): name, project, when and status no longer at 0.5 opacity (contrast);
  their text → `$ink-muted`; only the tile and the project and status icons stay at 0.5.
- [x] `atoms/Switch/On` (`vyJn4`): 34×20 → 34×24, the 20 px `Track` (`uz0aP`) inside with 2 px above and below
  (target size); fill `$brand-1` → `$brand-1-strong` (Lemonade's `$brand-1` is under 3:1 on white).
- [x] `atoms/Switch/Off` (`cAyC4`): track `$border-strong` → `$field-border` (invisible on white, under 3:1).
- [x] `molecules/History row` (`sdDvl`): `Time` `$ink-faint` → `$ink-muted` (contrast).
- [x] `molecules/Filter chip` (`HyXbi`): `Count` `$ink-faint` → `$ink-muted` (contrast).
- [x] `atoms/Button/Destructive` (`seB4b`): new, an instance of `atoms/Button/Attention` with fill `$attention-ink`,
  `trash-2`, "Delete"; the code's `destructive` variant. White on `$attention` is 3.8:1. A variant rather than a
  change to `Attention`, which `01` and `17` also use.
- [x] 09 Schedules (`D7r3x`): table header labels `$ink-faint` → `$ink-muted` (contrast); "Running now · today 8:00"
  (`loader-circle`) and the "Done · …" rows (`circle-check` `$project-green`) → "Started · …" with `circle-play`
  `$link-ink` (the app doesn't know whether another project's run is still running).
- [x] 10 Schedule · its runs (`G1Wg0U`), 75 (`H0Y0UY`), 76 (`GUVm0`), 77 (`DaeZG`), 78 (`gZAuG`): finished runs'
  second line "Done" → "Finished at 8:04" / "Finished at 8:06" / "Finished at 8:02" (the app can't tell whether the
  agent waits for an answer).
- [x] 78 Schedule · delete? (`gZAuG`): `Delete schedule` (`gAPid`) `atoms/Button/Attention` →
  `atoms/Button/Destructive` (contrast).
- [x] 11 Project · all conversations (`MN3wL`): the person's rows (Cover letter for Allegro, Salary ranges in Warsaw,
  Rewrite my CV) "You · N messages · …" → "Started by you" (message counts aren't known); `Footer` (`H5E409`) with
  "Show 23 older" hidden (the list isn't paged).

`77`'s error already read "Couldn't save. <the daemon's reason>"; unchanged.

## Round 10 · implementation (schedules, #28)

Asked: word a late run's timing as the built app does. The daemon doesn't know why a run started late, and the agent's
environment still starting is a third likely cause, so the text names all three.

- [x] `molecules/Run header` (`e3sGdM`): `Meta` (`G6hMR`) "Due Tue 7:00 · ran 7:42, your Mac was asleep until then" →
  "Due Tue 7:00 · started 7:42, late: the computer was asleep, piko was closed or the agent's environment was still
  starting"; `auto` → `fixed-width`, `fill_container`, so it wraps to a second line.
- [x] 13 Conversation · the agent's computer is waking up (`J5p5m`), `Run header` (`lXEMc`), and 16 Conversation · a
  connected account stopped working (`S0qTs`), `Run header` (`Uvxq8`): `Meta` override "Due today 7:00 · ran on time" →
  "Due today 7:00 · started 7:00", the app's on-time form.
- [x] 10 Schedule · its runs (`G1Wg0U`, row `R5Eazq`), 75 (`H0Y0UY`, `s4T6T`), 76 (`GUVm0`, `GBLEE`), 77 (`DaeZG`,
  `pw5ad`), 78 (`gZAuG`, `kn1P2`): the late run's `Meta` "Due 8:00 · started 9:14, the computer was asleep or piko was
  closed" → "Due 8:00 · started 9:14, late: the computer was asleep, piko was closed or the agent's environment was still
  starting".
- [x] 11 Project · all conversations (`MN3wL`), row `AqOtr`: `Meta` "Due 7:00 · started 9:13" → "Due 7:00 · started
  9:13, late: the computer was asleep, piko was closed or the agent's environment was still starting" (two hours after
  its term, the app says why).
