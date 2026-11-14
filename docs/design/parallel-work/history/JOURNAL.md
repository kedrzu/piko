# Journal

Append-only. One line per turn that settled something, was rejected, or got an answer from the owner.

- 2026-11-14 — Session opened. Owner's brief: develop the app in parallel across several Paseo
  worktrees and agents; one orchestrating skill that splits work into chunks, creates GitHub issues,
  links them with blocking relations, and helps plan the next stage (handing over to `/dev:design`
  when planned work runs out). The orchestrator does not relay other agents' messages — the owner
  watches them in Paseo. Survey: `/dev:deliver` explicitly refuses to turn designs into issues or fan
  out; the product design leaves build order out (poweragents D21); GitHub issue dependencies and
  sub-issues available (GraphQL `addBlockedBy`, `addSubIssue`, checked live); no issues yet.
- 2026-11-14 — Owner: why = one agent at a time caps how fast a large app gets built. Unit = a slice
  the owner can try (D1). Overlap resolved at merge via git-workflow (D2). Owner leans to smaller
  tasks through other `/dev:*` entry points rather than `/dev:deliver` — tension with D1's size, put
  to owner. Owner asked: GitHub Projects vs Issues, Projects as a dashboard.
- 2026-11-14 — Owner: GitHub Projects as the dashboard (D4). Owner rejected a rule for what a chunk
  is — agent proposes sensible chunks in conversation; purely technical tasks are fine (D3 replaces
  D1, D1 to history).
- 2026-11-14 — Owner: design sessions are tasks launched by the orchestrator on the owner's OK,
  proposed early enough to keep a backlog (D5); skill lives in this repo (D6). Still open: whether
  code agents start on the owner's word or by themselves when unblocked.
- 2026-11-14 — Owner: agents start on the owner's word (D7). Proposed, not yet confirmed: the
  orchestrator keeps no memory of its own — state is GitHub and docs/design — with a Backlog column
  for not-yet-split work and approved design sessions. README written.
- 2026-11-14 — Owner: orchestrator keeps no memory, Backlog column (D8); launched agents Claude Opus
  5.5 medium, bypass (D9); minimal issue content (D10). Next: rightsize, then propose closing.
- 2026-11-14 — Rightsize run (three passes); all items but the Backlog column were already chosen
  by the owner with the simpler version in view, or concerned the record's form. Owner kept Backlog
  (D8 Rejected line). Owner closed the design. README carries what gets built first.
