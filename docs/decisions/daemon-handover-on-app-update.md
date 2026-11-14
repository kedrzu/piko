# Daemon handover on app update

## Status

Accepted

## Context

The desktop app starts the bundled daemon as a sidecar, and the daemon keeps running after the app quits, so schedules
and the agent's browser go on. A second daemon fails to bind the port and exits, and the app talks to the running one
(`packages/desktop/src-tauri/src/daemon.rs`). Once the app updates itself (`docs/desktop/RELEASING.md`), that rule
would keep the old daemon serving the new app forever.

The daemon must be replaced without losing the sandbox: the VM is deliberately not stopped when the daemon exits
(`packages/daemon/src/main.ts`), and a restarted daemon reuses the agent's container when its spec matches
(`packages/daemon/src/sandbox/LimaSandbox.ts`), so a conversation in progress survives a daemon restart. A daemon run
from a worktree in development shares the port and must never be touched by an installed app.

## Options Considered

- **Version on `/status`, compared at launch.** The shell passes its version to the sidecar (`POWERAGENTS_VERSION`);
  the daemon reports it. At launch the app signals the process listening on the port (pid from `lsof`, never from the
  answer) when it reports a different version, waits up to 10 s for the port, then starts its own. Trade-off: a daemon
  from a build before versions were reported is kept and stopped once by hand.
- **The same, also matching the listener's executable name** (`ps`), to replace version-less packaged daemons too.
  Trade-off: depends on the sidecar's file name inside the bundle and adds a lookup, for daemons that only exist on the
  owner's machine.
- **Stop the daemon when the app restarts for an update.** Trade-off: misses the case where the update is installed
  and the person quits and reopens the app later, which starts the new version too.
- **An authenticated shutdown endpoint.** Trade-off: the shell would need the app's credentials or a new channel; a
  same-user signal to the port's owner needs neither.

## Decision

Version on `/status`, compared at launch (owner, 2026-11-14). SIGTERM is graceful: the daemon closes its server,
including the app's open event stream, and exits without stopping the sandbox. No SIGKILL: a daemon that does not
stop in 10 s is kept and the failure logged.

## Consequences

Updating restarts the daemon and keeps the VM and the agent's container, so a turn in progress goes on — except when
the new version changes the container's spec, which recreates it. A daemon reporting no version is never signalled,
which protects worktree daemons and leaves pre-versioning daemons to be stopped once by hand.
