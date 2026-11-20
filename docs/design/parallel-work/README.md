# Building piko with several agents at once

piko is a large app with many features, and so far it has been built one agent at a time: one
conversation, one task, one pull request, then the next. This design is about building it with
several agents working at the same time, each on its own task in its own Paseo worktree, and about
the one skill that keeps that work planned.

## Why

One agent working on one thing caps how fast the app gets built. The repository is already set up
for more: every task gets its own worktree, branch and pull request, and branches catch up with
`main` by merging it. What is missing is the planning around it. There are no issues yet, the build
order lives in the owner's head (the product design deliberately leaves it out), and when the work
that has been thought through runs out, nothing says so in time to design the next part.

## What is different once it exists

The owner opens a conversation with the orchestrator and gets the state of things: what is ready to
start, what is running, what waits on what, and whether ready work is about to run out. They agree on
how to split the next piece of work, and the orchestrator puts it on GitHub as issues, linked by
"blocked by" so it is clear what can start after what. The owner says "start what's ready", and a few
new workspaces appear in Paseo, each with an agent already working on its issue. From there the owner
talks to those agents directly, the way they already do; the orchestrator does not relay anything.

When the board is close to empty, or a part of the app turns out to be too unclear to split, the
orchestrator proposes a design session, and once the owner agrees it opens one in its own workspace.
A GitHub Project gives the owner a board of what is to do, in progress, in review and done.

## How the work is split

There is no rule for what a task is. The orchestrator proposes chunks that make sense and the owner
settles them in conversation. A task may be something to try in the app, or purely technical — the
agent's sandbox, how skills or plugins work underneath ([why there is no rule](DECISIONS.md#d3)).
Which development skill builds a task (`/dev:task`, `/dev:feature`, occasionally `/dev:deliver`) is
also decided per task.

Two tasks can touch the same files and still run at once. The second branch to land meets the first
one's changes when it merges `main`, and resolves them there, the way the git workflow already says
([why overlap is not planned around](DECISIONS.md#d2)).

## Where the plan lives

Each task is a GitHub issue; dependencies between tasks are GitHub's own "blocked by" relations. The
issues sit on a GitHub Project, which adds what issues alone lack — a task being in progress or in
review — and most of those moves happen by themselves: linking a pull request, merging it and closing
the issue each move the card ([what the board does on its own](DECISIONS.md#d4)).

## Starting agents

Nothing starts without the owner's word ([why](DECISIONS.md#d7)). For each task the owner approves,
the orchestrator creates a worktree from `main`, starts an agent there with the task's issue, and
moves the card to In progress. A design session starts the same way, running `/dev:design`, and the
owner carries that conversation in its own workspace ([design sessions as tasks](DECISIONS.md#d5)).
When it lands, its design folder is what the next planning conversation splits into tasks.

## How far this design goes

This covers the orchestrating skill and the conventions it relies on in this repository, where the
skill lives ([why here](DECISIONS.md#d6)). It does not change how an agent builds a task — that stays
with the `/dev:*` skills and the git workflow.

## What is still open

Whether the git workflow needs a passage on resolving conflicts between tasks that ran in parallel;
the first conflicts will show it.
