# Decisions

The decisions in force: grepped and re-entered, never read front to back. A heading is the
decision's ID alone, so `DECISIONS.md#d3` keeps resolving after the wording is sharpened. Retired
decisions, the journal and notes from reviews live in [history/](history/).

**Before proposing a change in an area, read the Rejected lines of its decisions and the history
they link to.** Reopening a rejected option is right when its premise changed; repeating it without
knowing it was rejected is not.

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

## D3

**There is no fixed rule for what a unit of work is. The orchestrator proposes a split into chunks
that make sense, and the owner settles it in conversation, case by case; a purely technical task
(the agent's sandbox, how skills or plugins work underneath) is as valid as one visible in the UI.**
(2026-11-14, owner) Which `/dev:*` entry point builds a chunk is also decided per chunk.

**Why.** A classification rule is ceremony the owner does not want, and real work includes tasks with
nothing to try in the UI. Leaving the shape open keeps room for planning.

**Rejected.**

- Only slices the owner can see and try, never a technical layer
  ([history](history/DECISIONS.md#d1)) — too much process, and wrong for purely technical work.
- Small technical tasks, one per layer, as the rule — same problem from the other side.

## D4

**The work is tracked as GitHub Issues in the repository, shown on a GitHub Project used as the
owner's dashboard of what is to do, in progress, in review and done.** (2026-11-14, owner)

**Why.** Issues alone are only open or closed; a Project adds the "in progress" and "in review" states
and a board where blocked issues are marked. Issues stay the data — the task text, the blocked-by
relations, closing through `Closes #N` — and the Project is a view over them.

> **Checked 2026-11-14:** a new Project sets Done on closed items and merged PRs by default; other
> built-in workflows set Status on "pull request linked to issue", reopen, review approved —
> [built-in automations](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations).
> Blocked issues carry a "Blocked" icon on project boards; `gh issue create --blocked-by` and
> `gh issue edit --add-blocked-by` exist —
> [issue dependencies](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies).
> GraphQL has `addBlockedBy` and `addSubIssue` (introspected on this repo). `gh` token has the
> `project` scope; the owner has no Project yet. Free plan: one auto-add workflow per Project.

**Rejected.**

- Issues only — no "in progress" state without labels kept by hand, and no board.
