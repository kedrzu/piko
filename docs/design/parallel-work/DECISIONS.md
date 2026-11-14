# Decisions

The decisions in force: grepped and re-entered, never read front to back. A heading is the
decision's ID alone, so `DECISIONS.md#d3` keeps resolving after the wording is sharpened. Retired
decisions, the journal and notes from reviews live in [history/](history/).

**Before proposing a change in an area, read the Rejected lines of its decisions and the history
they link to.** Reopening a rejected option is right when its premise changed; repeating it without
knowing it was rejected is not.

## D1

**A unit of work handed to one agent is a piece of the app the owner can see and try — a feature
slice — not a technical layer.** (2026-11-14, owner) How big such a slice is, and which `/dev:*`
entry point builds it, is still open.

**Why.** The owner checks direction by trying things, not by reading code; a layer ("the daemon
endpoint for schedules") cannot be tried until other layers join it, so every layer task would need
watching and a later integration step.

**Rejected.**

- Small technical tasks, one per layer, each through `/dev:task` — more parallelism, but many issues
  and dependencies to manage, and nothing to try until they add up.

## D2

**Agents working on slices that touch the same code are not prevented from running in parallel;
the overlap is resolved at merge time, by the rules in the `git-workflow` skill.** (2026-11-14,
owner) Whether `git-workflow` needs a passage on this is open.

**Why.** Predicting file overlap when splitting work is guesswork, and `git-workflow` already makes
every branch merge `origin/main` before each push and resolve conflicts by intent.

> **Checked 2026-11-14:** `git-workflow` → Sync merges `origin/main` before every push and before
> Land, and gives conflict resolution to the agent — `.claude/skills/git-workflow/SKILL.md:81`.

**Rejected.**

- A "do not run together" relation between issues, decided when splitting — GitHub has no such
  relation and the split would have to predict which files each slice touches.
