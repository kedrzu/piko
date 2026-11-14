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
