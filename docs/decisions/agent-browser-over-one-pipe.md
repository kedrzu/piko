# The agent's browser is driven over one pipe, multiplexed by the daemon

## Status

Accepted

## Context

D27 puts one Chromium per profile on the host and has the agent drive it from the sandbox through a tunnel the
daemon provides. Several conversations browse at once. Logins must be shared through one cookie store, but each
conversation must see only its own pages: `agent-browser`, the agent's CLI, attaches to every page target it is shown.
The tunnel also has to enforce the agent's limits (no `file:` navigation, downloads pinned, no foreground windows).

> **Checked 2026-11-14:** Chrome launched with `--remote-debugging-pipe` exits when its parent is killed (prototype,
> `ps` after SIGKILL of the Bun parent). `Target.createTarget` has no window parameter, so each page gets its own
> window. agent-browser v0.43.0 over `--cdp ws://…` attaches to every page and needs no `/json/version` (source).

## Options Considered

- **Debugging port, one Chrome connection per tunnel client:** Chrome scopes ids, sessions and events per connection,
  so the daemon needs far less code, and the browser survives a daemon restart. Trade-off: every local process can
  drive the browser through the port, logins included.
- **One pipe, multiplexed by the daemon:** no port exists for other processes. The daemon remaps message ids, routes
  flattened CDP sessions to the socket that opened them, filters target events by conversation, and keeps its own
  sessions (handoff, thumbnails) invisible to clients. Trade-off: that multiplexing code, and a daemon restart ends
  the browser and its page state (cookies are kept).
- Module shape, compared as three designs: one service hiding everything (smallest interface, a monolithic router
  #27 would have to cut open); about nine units with per-client policies and a platform focus interface (seams with no
  consumer yet); a promise-based `BrowserService.send()` that hides browser ids from the tunnel (chosen).

## Decision

One pipe, multiplexed by the daemon, in the promise-based shape: `ChromiumInstall`, `BrowserService` (pipe, ownership,
popups, handoff primitives), `FocusKeeper`, `BrowserNetworkGuard`, `BrowserTunnelService`, and the pure
`checkCdpRequest` policy with an explicit allow-list. The daemon's own calls bypass the policy; #27's live view uses
the same `send` and `event` channel. Chosen by the owner, 2026-11-14.

## Consequences

No local process other than the daemon can drive the agent's browser, and conversations are isolated from each other
inside one profile. The daemon owns a CDP multiplexer and an allow-list that must be re-checked when agent-browser is
updated. Restarting the daemon (every edit under `bun --watch`) restarts the browser.
