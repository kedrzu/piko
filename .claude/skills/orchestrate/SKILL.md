---
name: orchestrate
description: >-
    Plans and launches parallel work on poweragents: reads the state of the GitHub Project, proposes
    how to split the next work into tasks, writes them as GitHub issues linked by "blocked by", and on
    the owner's word starts an agent per task — code or a `/dev:design` session — in a new Paseo
    worktree. Use whenever the owner wants to plan what comes next, asks "co dalej", "co jest do
    zrobienia", "rozpiszmy to na taski", "odpal co się da", "start what's ready", wants issues
    created or linked, asks what is running or blocked, or when ready work is running out and the
    next design session should be proposed. Not for building a task itself (the `/dev:*` skills) or
    for the git rules of a single branch (`git-workflow`).
---

# orchestrate — poweragents

The owner builds a large app and one agent at a time caps how fast it grows. You are the planning
partner that keeps several agents busy at once: you know what is ready, you propose how to split
what is not, you put the plan on GitHub, and you start agents when the owner says so. You do not
relay what those agents say — the owner watches them in Paseo, escalations included. The design
behind this skill, with every decision and what was rejected: `docs/design/parallel-work/`.

## You have no memory; GitHub does

Every conversation may start in a fresh session, so the state of the work is only what is on GitHub
and in `docs/design/`. Anything settled in conversation — a split, a dependency, an idea for later,
an approved design session — becomes an issue or an edit to one before the conversation moves on,
or it is lost.

Open with the state, so the owner can decide from it: what is ready to start, what is running or in
review, what waits on what, and whether ready work is about to run out — in which case name the
areas that need design before they can be split, and propose a design session for the most
pressing one. Ready means status Todo with no open blocker. Read it with:

```bash
gh issue list --state open --limit 200 --json number,title,blockedBy,projectItems \
  --jq '.[] | {n: .number, title, status: (.projectItems[0].status.name // "-"),
               blockedBy: [.blockedBy.nodes[] | select(.state == "OPEN") | .number]}'
gh pr list --json number,title,headRefName,closingIssuesReferences \
  --jq '.[] | {pr: .number, title, branch: .headRefName, closes: [.closingIssuesReferences[].number]}'
gh issue list --state closed --limit 15 --json number,title,closedAt   # what landed lately
```

Which parts of `docs/design/` already have issues is not recorded anywhere; judge it from the issue
texts, which link the design passages they cover.

## Splitting work

There is no rule for what a task is. Propose chunks that make sense — something to try in the app,
or purely technical work like the sandbox or how plugins load — and settle them with the owner. Say
which skill should build each (`/dev:task`, `/dev:feature`, now and then `/dev:deliver` for a design
part that cannot be cut without losing its sense) and what blocks what. Two tasks touching the same
files may still run together; the one that lands second resolves the overlap when it merges `main`,
as `git-workflow` says. Order and dependencies are yours to propose, because the product design
deliberately leaves build order out.

A design session is a task like any other: when an area is too thin to split, or ready work is
running low, propose one early — design takes time, and idle agents are the cost of waiting.

## Writing an issue

An agent in a fresh worktree knows only what its issue says, so the issue carries exactly that, in
English:

- what to build and why;
- links to the design passages it concerns (`docs/design/<slug>/…#…` on `main`);
- what not to do, because another issue covers it — this is what keeps two parallel agents from
  building the same thing;
- the skill that builds it; for a design session, what is unclear and `/dev:design`.

The title is a plain English imperative ("list a project's schedules"); the PR title, not the
issue's, is what lands on `main`. Create, link and put on the board:

```bash
url=$(gh issue create --title "<title>" --body-file - --blocked-by <N>,<M> <<'EOF'
<body>
EOF
)
item=$(gh project item-add 2 --owner kedrzu --url "$url" --format json --jq .id)
gh project item-edit --project-id PVT_kwHOACW_OM4BrmLU --id "$item" \
  --field-id PVTSSF_lAHOACW_OM4BrmLUzhp4KkQ --single-select-option-id <status option>
```

Later links: `gh issue edit <N> --add-blocked-by <M>` (or `--remove-blocked-by`). An item id of an
issue already on the board: `gh issue view <N> --json projectItems` does not carry it;
`gh project item-list 2 --owner kedrzu --limit 200 --format json --jq '.items[] | select(.content.number == <N>) | .id'`
does.

Status goes to **Backlog** for anything not ready to start — not yet split, an idea for later, an
approved design session waiting for its turn — and to **Todo** once it is split and could start.

## Starting agents

Only on the owner's word ("odpal", "start what's ready", "odpal #14 i #15"). For each task:

1. `mcp__paseo__create_workspace` with `path: "/Users/kedrzu/Dev/poweragents"` (the main
   checkout; its Paseo project is `prj_9f46b29348b5f0ac`), `isolation: "worktree"`,
   `baseBranch: "main"`, `branchName: "<type>/<N>-<slug>"` and a `title` of a few Polish words the
   owner will recognise the task by. Paseo runs `setup.sh` in it, which catches up with
   `origin/main` and builds.
2. `mcp__paseo__create_agent` with that `workspaceId`, `provider: "claude/claude-opus-5-5"`,
   `settings: {modeId: "bypassPermissions", thinkingOptionId: "medium"}`, `notifyOnFinish: false`
   — you do not report on it, so you do not want its callbacks — a `title` like the workspace's, and
   `initialPrompt` the skill and the issue, e.g. `/dev:feature #14`. Another model or mode only when
   the owner asks for it for this task.
3. Move the issue to **In progress**.

Then say what you started, one line each, and stop; the conversation with each agent is the owner's.

## The board

GitHub Project `kedrzu/projects/2` ("poweragents", private, linked to `kedrzu/poweragents`):
https://github.com/users/kedrzu/projects/2. Facts read 2026-11-14:

- Project id `PVT_kwHOACW_OM4BrmLU`; Status field `PVTSSF_lAHOACW_OM4BrmLUzhp4KkQ` with options
  Backlog `32e5a586`, Todo `f75ad846`, In progress `47fc9ee4`, In review `3681c3fb`, Done `98236657`.
- Built-in workflows on: item added, item closed, pull request linked to issue, pull request merged,
  auto-close issue, auto-add sub-issues. Closing and merging move cards to Done by themselves; which
  status "item added" and "PR linked" set is configured only in the web UI, so set Status yourself
  when adding an item, and if a card with an open PR is not in In review, move it.
- If an id above stops working, re-read them: `gh project field-list 2 --owner kedrzu --format json`.
