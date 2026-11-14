# Schedules as project files with an RRULE

## Status

Accepted

## Context

Schedules run the agent without being asked (issue #21). Each belongs to a project, and each run is an ordinary
conversation there ([D29](../design/poweragents/DECISIONS.md#d29)). They run only while the computer is awake, and a
missed time runs once on wake ([D13](../design/poweragents/DECISIONS.md#d13)). The person never needs a settings screen,
because the agent sets schedules up from a conversation ([D14](../design/poweragents/DECISIONS.md#d14)). That leaves
three questions:

- how the agent reaches schedules;
- how a recurrence is written;
- whether OpenCode's own scheduler does the job.

The agent already creates projects by writing `.project.json` into the data root, which the sandbox mounts. The daemon
reads the same files.

The recurrences people ask for include "every other Thursday", "every three weeks", "the third Thursday of the month" and
"the 1st of the month unless it is a Monday".

> **Checked 2026-11-14:** OpenCode 2.2.7's `experimental/schedule` requires a `sessionID` and wakes that one session at
> each time (`Schedule.CreatePayload` in `packages/opencode/src/openapi.json`). D29 needs a new conversation per run.

> **Checked 2026-11-14:** `rrule-temporal` 2.2.9 (MIT; its only dependency is `temporal-spec`, for types) implements RFC
> 5545 on `Temporal`. Bun 1.4.4 ships `Temporal` natively. A script computed `FREQ=WEEKLY;INTERVAL=3;BYDAY=TH`,
> `BYDAY=3TH` and `BYMONTHDAY=1;BYDAY=TU,…,SU` correctly. `rrule` 2.8.1, the long-standing library, was last released
> in 2023 and handles time zones through workarounds.

## Options Considered

**How the agent reaches schedules**

- **Daemon MCP server** ([D30](../design/poweragents/DECISIONS.md#d30)): tools with validation in the daemon.
  Trade-off: it opens a port from the sandbox to the host, which needs a firewall opening and a token. It also adds
  tool definitions to every agent's context.
- **Files and a skill.** The agent writes `<project>/.schedules/<id>.json` as the `schedules` skill describes. The daemon
  validates the file. Within seconds it writes `<id>.state.json` beside it, holding either the error or the next times.
  Trade-off: the agent can write a broken file. The state file makes that visible to the agent, which fixes the file.
  The skill also makes the agent read the next times back to the person, which catches a rule that is valid but wrong.

**How a recurrence is written**

- **Structured fields** (daily, weekly, monthly at `HH:MM`): easy to show and edit in a form, but they cannot express
  most of the requests above.
- **Cron**: expresses the nth weekday and "unless Monday" only through dialect extensions. It cannot express "every N
  weeks" at all.
- **Cron with a step on top** ("every N weeks from date D"): covers everything, but the format is ours, not a standard.
- **RRULE (RFC 5545) with a start date**: the calendar standard (Google Calendar, `.ics`), which models know well. It
  covers every case above. Its interval is anchored at the start date. Trade-off: it depends on a library, and RFC
  daylight-saving behaviour omits a time inside the spring gap.

**Interval anchor**

- **Calendar-anchored** (as in Google Calendar).
- **From the last run** (as Todoist's `every!`, which counts from completion). For routines the calendar anchor is
  expected, and D13's rule of catching up once already gives the effect of counting from the last run.

## Decision

- **Schedules are files in the project, written by the agent through a skill and by the daemon's API alike.** Each has a
  daemon-owned state file next to it, which is the agent's feedback channel. The daemon's MCP server waits for
  cross-project orchestration.
- **A recurrence is an RRULE with a local start date-time**, in the computer's time zone, computed by `rrule-temporal`.
  Each schedule also stores a required human description (`when`), which people read and nothing interprets.
- **OpenCode's `experimental/schedule` is not used.**

## Consequences

- Every schedule capability is reachable by the agent with no new network path out of the sandbox.
- The daemon runs one loop that scans the schedule files every 5 seconds. It validates them, writes each state only when
  it changed, and starts the runs that are due.
- A schedule's run history lives in its state file. That file is also how a conversation is linked to its schedule,
  since conversations exist only in OpenCode. Deleting a schedule deletes its history.
- People can only edit a rule by talking to the agent. The UI shows `when` and the next times. Editing from the UI is
  planned as a conversation with the schedule attached.
- RRULE times inside a daylight-saving gap are skipped that day.
