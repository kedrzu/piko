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

## D5

**A design session is a task like any other: the orchestrator proposes it, and once the owner agrees
it opens a separate Paseo workspace running `/dev:design`, where the owner carries the design
conversation.** The orchestrator proposes it early enough to keep a backlog of ready work — when the
ready work is running out, or as soon as something turns out to be too unclear to split.
(2026-11-14, owner)

**Why.** The orchestrator manages what runs; the conversations themselves happen in their own
sessions, design ones included. Waiting until the board is empty would leave the parallel agents idle
while design catches up.

**Rejected.**

- The orchestrator only says "this needs design" and leaves starting it to the owner — inconsistent
  with how code tasks are launched.

## D6

**The orchestrating skill lives in this repository, under `.claude/skills/`.** (2026-11-14, owner)

**Why.** For now it serves poweragents only, so it may name this repo, its Project and its design
folders directly.

**Rejected.**

- A skill in the `dev` plugin (`kedrzu/skills`), usable in any project — not needed yet.

## D7

**Agents start only on the owner's word.** In a planning conversation the owner says what to launch
("start what's ready"); the orchestrator then creates a Paseo worktree per agreed task, starts an agent
in it and moves the issue to In progress. Nothing watches GitHub in the background. (2026-11-14,
owner)

**Why.** The owner comes back to the orchestrator to plan anyway, and design sessions already start
on the owner's OK ([D5](#d5)) — one rule for every kind of task.

> **Checked 2026-11-14:** Paseo MCP `create_workspace` makes a worktree from a source checkout
> (`path`, `isolation: worktree`, `branchName`, `baseBranch`, `title`); `create_agent` takes
> `workspaceId`, `provider` (`claude`, `codex` available on this machine), `initialPrompt`, mode.
> The poweragents main checkout is `/Users/kedrzu/Dev/poweragents`, Paseo project
> `prj_9f46b29348b5f0ac`.

**Rejected.**

- The orchestrator starts agents itself when a blocker closes — needs a periodic check (a Paseo
  heartbeat) and a cap on parallel agents, and agents appear when the owner does not expect them.

## D8

**The orchestrator keeps no memory of its own: the state of the work is the GitHub Project, its
issues and pull requests, and the folders in `docs/design/`. Every planning conversation may start
from a fresh session, and opens with a review of that state.** Work not yet split into tasks, ideas
for later and approved design sessions are issues in a **Backlog** column; **Todo** means split and
ready to start. (2026-11-14, owner)

**Why.** Everything that happens already leaves a trace on GitHub — a design session ends in a PR
with its folder, a task in a merged PR that closes its issue — so a long-lived orchestrator session
would only hold a copy that drifts. The cost is that whatever a planning conversation settles must be
written to GitHub, or it is lost.

**Rejected.**

- One long-lived orchestrator session that remembers the plan — its memory dies with the session
  and duplicates the board.

## D9

**Launched agents run Claude Opus 5.5 (`claude-opus-5-5`) at medium reasoning effort, in bypass
permission mode, unless the owner asks for something else for a task.** (2026-11-14, owner)

**Why.** Several agents at once in a stricter mode would each ask the owner for permissions.

> **Checked 2026-11-14:** Paseo `list_models claude` lists `claude-opus-5-5` with thinking option
> `medium` (its default); `list_providers` lists Claude mode `bypassPermissions`.

**Rejected.**

- Claude's "auto" mode, where a classifier reviews permission prompts — the owner chose bypass.

## D10

**An issue carries what its agent needs and nothing more: what and why, links to the design
passages it concerns, what not to do because another issue covers it, and which skill builds it.
The agent's first prompt is that skill with the issue, e.g. `/dev:feature #14`; a design session's
issue says what is unclear and names `/dev:design`.** (2026-11-14, owner)

**Why.** An agent in a fresh worktree knows only what the issue tells it; the "not this" line is what
keeps two parallel agents from building the same thing.

**Rejected.**

- A fuller template (acceptance criteria, file lists, estimates) — the `/dev:*` skills plan the work
  themselves.
