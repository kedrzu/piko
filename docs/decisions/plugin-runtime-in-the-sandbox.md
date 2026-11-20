# Plugins reach the sandbox through a read-only daemon folder and per-session skill rules

## Status

Accepted

## Context

Design D34, D39, D40 and D42: a plugin is a folder of skills, an optional CLI and pinned environment additions; it is
installed for the profile or into one project; the agent installs without asking; a command names its plugin
(`/email-sorting:sort`) and the daemon stops one whose plugin is not visible. The agent runs OpenCode 2.2.7 in a
container in the Lima VM, with the profile's data root mounted at `/Piko`. Three things had to be settled: how a
project plugin's skills stay out of other projects, what id a plugin's skill has, and where the daemon keeps the list
of installed plugins and the copies the agent reads.

> **Checked 2026-11-14 (OpenCode v2.2.7 source):** a skill's id is its folder's name, with no character limit;
> `opencode.json` `skills: [paths]` adds skill folders. Session permission rules are merged last and the last match
> wins; `Skill.available` drops a skill denied by `{action: "skill", resource: <id>, effect: "deny"}`. A session takes
> its rules at `POST /api/session`, and `PATCH /api/session/{id}` replaces them. The server does not expand `/name` in
> a prompt; a prompt's `skills: [{id}]` loads a skill without passing through permissions.

> **Checked 2026-11-14 (live sandbox):** through `claude-agent`, a session with a deny rule on `probe:second` listed the
> other probe skills but not that one; after a `PATCH` it saw the new set. `probe:hello` loaded from a path with a dot
> in it.

> **Checked 2026-11-14 (live sandbox):** OpenCode's file watcher in the VM does not see changes made from the host over
> virtiofs: host writes alone left the skill list unchanged for 12 s. A plain file written from the VM side into the
> skills folder wakes its rescan, which then picks up every host change, additions and removals: the list was current
> within 2 s. A dotfile does not wake it. `POST /api/location/reload` also rescans, but cancels pending permissions and
> forms in every conversation.

> **Checked 2026-11-15 (throwaway container from the agent's image, in the sandbox VM):** with the data root mounted
> writable and a folder inside it mounted again `:ro` at the same path, `touch` and `mkdir` in that folder fail with
> "Read-only file system" while the rest of the data root stays writable. Dropping a pin and running `bun install --backend=copyfile` again removed the package from `node_modules`; dropping one from `requirements.in`, then
> `uv pip compile` and `uv pip sync`, removed it from the venv.

## Options Considered

**Hiding project plugins' skills from other projects:**

- **Per-session permission rules:** a `deny` on `skill:<plugin>:<skill>` for every project plugin installed only in
  other projects, set when the session is created and again before every prompt the daemon sends. Trade-off: a session
  in project B mid-run may see a skill newly installed in A for the rest of that run.
- **A `.opencode/opencode.json` per project folder:** written by the daemon into the person's project. Trade-off: daemon
  files in the person's folders, and whether OpenCode loads it per directory was never verified.

**The skill's id:**

- **`<plugin>:<skill>`:** the daemon copies each skill under that name, so the id the agent sees is the command.
  Trade-off: `:` in host file names.
- **`<plugin>--<skill>`:** portable file names. Trade-off: the agent translates between id and command.
- **Authors prefix their skill folders:** no copy needed. Trade-off: collisions, e.g. plugin `email` with skill
  `sorting-sort` against plugin `email-sorting` with skill `sort`.

**Where the daemon keeps its manifest and copies:**

- **A hidden `.piko/` in the data root, mounted a second time read-only over it in the container:** no VM
  configuration change; it travels with the profile; the agent cannot edit the manifest, so every install goes through
  the daemon and its event.
- **A daemon folder outside the profile, added as a Lima mount:** existing VMs' configuration edited and the VM
  restarted; the manifest is not in the profile.

## Decision

All three chosen by the owner on 2026-11-14 from a Design-It-Twice panel:

- **Per-session permission rules.** `buildSkillDenyRules` computes them; `ConversationService` sets the session's whole
  rule list, never appends to it. Because a prompt's `skills` bypass permissions, the daemon's own command check is the
  only gate for `/<plugin>:<skill>`.
- **`<plugin>:<skill>`.** A plugin writes plain `skills/<skill>/`; the daemon's copy adds the prefix.
- **`<data root>/.piko/`**, holding `plugins.json` (the manifest of installed bundled plugins and their
  projects), `plugins/<name>/` (copies of installed bundled plugins only) and `skills/<plugin>:<skill>/` (copies of
  every installed plugin's skills, bundled or own), listed in the image's `opencode.json` `skills`. `PluginService`
  syncs it at daemon start, after every install and removal, and when a conversation is created. After a sync that
  changed the skills, the daemon writes `skills/synced` from the VM side (`limactl shell`), not `location/reload`.

Two channels follow the same choices:

- **Sandbox → daemon:** `SandboxApiService` on `127.0.0.1:47614`, a second firewall opening beside the browser tunnel,
  with the sandbox's existing bearer token (`browser-token`), its address in `PIKO_DAEMON_URL`, and the project
  taken from the session named in `X-Opencode-Session`. The image's `piko` CLI (`plugin list|install|remove`)
  calls it. #50 adds its token route there.
- **The environment:** one volume, `piko-env` at `/opt/piko/env`. At every sandbox start and after every
  install and removal the daemon runs `bun install --backend=copyfile` on a generated `package.json` (npm pins and
  plugin CLIs as `file:` dependencies), and for Python `uv pip compile` then `uv pip sync` (sync alone installs exactly
  its list, without resolving dependencies). Python stays in over a CLI-and-npm-only version (owner, 2026-11-14).

## Consequences

- A project plugin's skills appear only in its project's conversations; the agent can still find it through
  `piko plugin list` and install it into another project.
- Whether subagent sessions inherit their parent's rules is unchecked. At worst a subagent sees another project's
  plugin skill, nothing beyond what the agent can do anyway.
- `:` in host file names is fine on macOS (APFS). A Windows host needs the skill copies made inside the sandbox's file
  system.
- A new mount, volume or environment variable recreates the agent's container on its first start after the update;
  conversations and the Claude sign-in live in volumes and stay.
- The agent's own plugins are still written in the writable `plugins/` beside the daemon folder (D40); only their
  skill copies pass through `.piko/`.
