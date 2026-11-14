# Retired decisions

Each heading is the retired decision's original ID; each form opens with when it was retired and what
replaced it. Never edited after it is written, apart from adding the next retired form.

## D1

Retired 2026-11-14, replaced by [D3](../DECISIONS.md#d3).


**A unit of work handed to one agent is a piece of the app the owner can see and try — a feature
slice — not a technical layer.** (2026-11-14, owner) How big such a slice is, and which `/dev:*`
entry point builds it, is still open.

**Why.** The owner checks direction by trying things, not by reading code; a layer ("the daemon
endpoint for schedules") cannot be tried until other layers join it, so every layer task would need
watching and a later integration step.

**Rejected.**

- Small technical tasks, one per layer, each through `/dev:task` — more parallelism, but many issues
  and dependencies to manage, and nothing to try until they add up.

