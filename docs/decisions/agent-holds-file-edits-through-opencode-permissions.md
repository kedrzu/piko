# The agent holds its file edits through OpenCode permissions

## Status

Accepted

## Context

A file the person is editing in the app can be rewritten by the agent at the same moment (design D9, open: file
history). The design settles that the agent waits, but only while the person is actually typing, not because the file
is open (round 2 of daily work, frame 31). The agent runs in OpenCode inside the sandbox with every action allowed
(D28), so nothing on the daemon's side sees an edit before it lands on disk.

> **Checked 2026-11-14** (spike on the owner's sandbox, OpenCode 2.2.7, `claude-agent` on Sonnet): with a global `ask`
> rule OpenCode asks only for the `write` and `edit` tools, both as the action `edit`, with resources relative to the
> session's folder (`["hello.md"]`). `toolStarted` arrives before `permissionAsked`. An answer held for 70 s kept the
> agent waiting with no timeout; after `once` it finished the edit.

> **Checked 2026-11-14:** OpenCode lists pending requests per folder (`GET /api/permission/request`,
> `location.directory`) and takes answers at `/api/session/{id}/permission/{requestID}/reply`
> (`packages/opencode/src/openapi.json`).

## Options Considered

- **OpenCode permissions.** A rule `edit → ask`, answered by the daemon. Trade-off: every edit waits for one round
  trip to the daemon, and a daemon that does not answer stalls the agent. Edits made through shell commands bypass it.
- **No hold, only a merge in the app.** Trade-off: the agent's change lands while she types, and the app can only merge
  or ask her afterwards. That is what the design rejected.
- **An OpenCode plugin in the container blocking `write`/`edit`.** Trade-off: code inside the sandbox that has to reach
  the daemon, which the sandbox is built not to do.

## Decision

OpenCode permissions. The agent's image carries the rule `{ action: 'edit', resource: '*', effect: 'ask' }` after the
allow-all one. A daemon service started with the daemon, not with the app, answers every request at once with `once`.
It holds the answer only for a file the person saved within the last 60 s, until 60 s pass with no save, she lets the
agent write now, or the conversation stops. Each time the agent's event feed opens again, the service answers the
requests pending in every project folder. The person still never sees a permission prompt (D28).

## Consequences

- The person's typing is protected from the agent's own edit tools. A shell command that writes a file is not, and the
  app merges such a change into her text (three-way merge), asking her only on a conflict.
- The daemon becomes part of the agent's edit path. Its permission service must start with the daemon and never drop
  a request, or the agent stalls. Its tests cover answering at once, holding, releasing and the pending requests after
  a reconnect.
- The image changes, so every sandbox rebuilds its agent image once.
