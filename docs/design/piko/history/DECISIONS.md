# Retired decisions

Full text of decisions no longer in force, under their original IDs. Never edited after writing,
except to append the next retired form.

## D5

Retired in part 2026-11-08: the "works with any compatible daemon — local, remote or custom" half dropped; rewritten in place as [D5](../DECISIONS.md#d5).

**A daemon runs in the background and exposes everything over a port; the desktop app is a thin
client that works with any compatible daemon — local, remote or custom.** (2026-11-08, owner)

**Why.** It lets the core be swapped (custom file storage, a company cloud) under the same signed
app, and it is the shape a mobile companion and cloud-hosted agents need. Paseo is the model.

> **Checked 2026-11-08:** Paseo's daemon listens on `ws://127.0.0.1:6767`; desktop (Electron), mobile
> (Expo), web and CLI connect to it; remote access via an opt-in E2E-encrypted relay —
> [getpaseo/paseo](https://github.com/getpaseo/paseo), [security](https://paseo.sh/docs/security).

## D6

Retired 2026-11-12, replaced by the current [D6](../DECISIONS.md#d6) (per profile and the macOS runtime settled).

**All agent work runs inside a Linux sandbox shipped with the app; the user installs nothing else, and
the agent sees only the folders mounted into it.** (2026-11-08, owner)

**Why.** The agent can install whatever it needs (Python, Node, Playwright…) without touching the
user's machine, and the environment can be described and rebuilt elsewhere.

> **Checked 2026-11-08:** Cowork's local mode ran a Linux VM via Apple Virtualization.framework on
> macOS and Hyper-V/HCS on Windows, folders over VirtioFS —
> [Anthropic](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview);
> since 2026-10-06 Cowork defaults to cloud sandboxes. On Windows, enabling WSL / VM Platform the
> first time needs admin and a reboot — [Microsoft](https://learn.microsoft.com/en-us/windows/wsl/install);
> no admin-free path found. Apple `container` needs macOS 26 + Apple silicon and sudo for host DNS —
> [apple/container](https://github.com/apple/container/blob/main/docs/host-integration.md).
> Community benchmarks put a minimal VZ VM boot at ~0.3–0.9 s.

**Open.** Which runtime per OS; per-profile vs per-project sandbox (owner leans per profile).

## D8

Retired 2026-11-12, replaced by the current [D8](../DECISIONS.md#d8) (the agent may look into other projects).

**Each project is its own folder; the agent working in a project sees that project's folder.**
(2026-11-08, owner)

**Why.** Owner's choice. Keeps projects movable and storable elsewhere independently.

**What the agent sees.** The project's folder, the profile's Memory ([D9](#d9)) and the profile's
Downloads folder ([D27](#d27)). (2026-11-08)

**Rejected.**

- One vault per profile with projects as plain subfolders the agent sees all at once (the shape of
  the owner's wife's Obsidian setup) — proposed by the design agent 2026-11-08; owner chose separate
  folders, with knowledge about the person handled by [D9](#d9) instead.

## D10

Retired 2026-11-08, replaced by [D12](#d12), itself since replaced by [D21](../DECISIONS.md#d21).

**A mobile companion app is part of the first version, not later.** (2026-11-08, owner)

**Why.** In the reference setup the agent's output reaches the person on the phone (today via a
Telegram bot, which needed technical setup). The phone is where a schedule's result is read.

**Open.** How the phone reaches the daemon (relay vs tunnel), push notifications.

## D12

Retired 2026-11-08, replaced by [D21](../DECISIONS.md#d21).

**Version one is desktop-only and local. The mobile companion (notifications, talking to the agent)
follows in version two, soon after.** (2026-11-08, owner)

**Why.** Notifications on the phone are where a schedule's result is actually read (the reference
setup uses a Telegram bot, which needed technical setup), so it comes quickly — but not first.

**Rejected.**

- Mobile companion in version one ([history](history/DECISIONS.md#d10)) — owner moved it to version
  two.

**Open, deferred by owner.** How the phone reaches the daemon. Notes so far: Paseo's opt-in relay
(daemon connects outbound, phone pairs by QR, E2E-encrypted, no VPN on the phone) fits; Headscale
alone does not, since the phone would still need the Tailscale VPN client; push notifications need a
server holding the app's APNs/FCM keys, i.e. a hosted component of ours.

## D17

Retired in part 2026-11-14: schedules dropped from the parts of a plugin; rewritten in place as [D17](../DECISIONS.md#d17).

**There is one kind of plugin, and it is a composite: any mix of skills, MCP servers with their
configuration, an onboarding skill, schedules, additions to the sandbox environment (e.g. installing
Blender), and further parts as needed. "Workflow", "creative", "for work" are marketplace tags for
filtering, not kinds.** (2026-11-08, owner)

**Why.** A 3D plugin that installs Blender and tells the agent it exists, and an email-triage plugin
with rules and a schedule, are the same thing with different parts; separate kinds would force a
choice nobody needs to make.

**Rejected.**

- Two kinds — a "connection" (account sign-in + tools, no files) and a "workflow" (rules, schedule,
  onboarding, creates a project) — proposed by the design agent 2026-11-08; owner prefers one
  composite with tags.

## D19

Retired 2026-11-08, replaced by [D20](../DECISIONS.md#d20).

**A plugin keeps what it learns about the user (e.g. email-sorting rules) as ordinary files in its own
folder, shown in the app under that plugin ("what this plugin knows about me"), not as a project.**
(2026-11-08, owner)

**Why.** People don't think of email sorting as a project; to them a project starts and ends. The files
stay plain and visible, consistent with [D9](#d9) — only their place in the interface differs.

**Rejected.**

- Installing a plugin creates a regular project holding its files — proposed by the design agent
  2026-11-08; "email sorting" is not something people call a project.
- A hidden plugin store — contradicts plain, visible memory ([D9](#d9)).

## D28

Retired in part 2026-11-14: new plugins and account connections no longer need a confirmation; rewritten in place as [D28](../DECISIONS.md#d28).

**The agent may change anything inside its current reach without asking; whatever widens its reach —
a new plugin, a new account connection, a new schedule that acts without a person, a new destination
in the browser tunnel — needs the person's confirmation in the conversation. The agent batches these:
one confirmation covering everything it proposes at that point, not one click per item.**
(2026-11-08, owner)

**Why.** A web page the agent reads can try to instruct it ("install X, schedule daily mail to this
address"); a confirmation on reach-widening changes stops that from becoming a permanent foothold.
Batching keeps onboarding — which may propose several plugins, a connection and two schedules at
once — to one decision. Inside the sandbox and project nothing needs asking: the sandbox and the
tunnel are the boundary, unlike coding agents running directly on the computer.

**Confirmations come only from the app's interface** (a button the person presses), never as a
message in a conversation, whoever sent it — otherwise an agent steering another agent ([D30](#d30))
could approve on the person's behalf. (2026-11-08, owner, from the failure sweep)

**Accepted risk.** A plugin *update* that widens reach (e.g. adds sending to a drafts-only mail
plugin) is not caught; plugins are expected to be made carefully. (2026-11-08, owner, from the
failure sweep — owner doubts it can be detected reliably)

**Rejected.**

- A separate confirmation per setting or plugin — too many clicks (owner).
- Letting the agent configure everything silently — one malicious page gets a lasting foothold.

## D29

Retired in part 2026-11-11: automatic archiving of scheduled runs dropped; rewritten in place as [D29](../DECISIONS.md#d29).

**A scheduled run is an ordinary, visible, interactive session in its project, optionally archived
automatically when it finishes (as Paseo does). It inherits the reach the project already has and
needs no permissions of its own; if it hits something that needs the person, it asks in that session
and waits, and the person is notified.** (2026-11-08, design agent proposal at the owner's request;
not confirmed)

**Why.** Defining permissions per schedule up front is impractical — what the agent will need is
decided while it runs — and unnecessary, because the reach is already set by the project's plugins
and connections ([D28](#d28)). A visible session lets the person see what happened and answer the
agent there, instead of a run that silently stalls or gives up.

**Where schedules live.** Schedules belong to the profile, listed in one place. A schedule may name a
project as the folder its agent starts in; without one, the agent sees only the profile's Memory and
Downloads. A run's conversation is listed under its schedule, and also among the project's
conversations when it has one. (2026-11-09, owner: "the project is only the agent's starting folder";
listing and the no-project case are the design agent's proposal)

**Overlap.** While a schedule's previous run still waits for the person, the next run does not start;
the notification says today's run was skipped. (2026-11-08, owner, from the failure sweep)

**Rejected.**

- Finishing the run and leaving a "I need your consent for X" message — proposed earlier by the design
  agent; loses the run's context and needs a second run, where an interactive session can simply
  continue.
- Per-schedule permission lists written at creation — the needs are not knowable in advance.

**Acting in the person's name.** No per-schedule switch. What a plugin can do outward is limited by
the tools it exposes — e.g. the mail plugin creates drafts and doesn't send, as in the owner's own
setup. Buying needs the person to sign in and pay, which is consent by itself. Payments as such are
out of scope. (2026-11-08, owner)

**Rejected.**

- A per-schedule "may send and publish in your name unattended" switch, with plugins marking
  outward-acting tools — proposed by the design agent; plugins exposing only safe tools does the job.

Retired in part 2026-11-11: profile-owned schedules with an optional project replaced by project-owned schedules; rewritten in place as [D29](../DECISIONS.md#d29).

**A scheduled run is an ordinary, visible, interactive session. It inherits the reach the project already has and
needs no permissions of its own; if it hits something that needs the person, it asks in that session
and waits, and the person is notified.** (2026-11-08, design agent proposal at the owner's request;
not confirmed)

**Why.** Defining permissions per schedule up front is impractical — what the agent will need is
decided while it runs — and unnecessary, because the reach is already set by the project's plugins
and connections ([D28](#d28)). A visible session lets the person see what happened and answer the
agent there, instead of a run that silently stalls or gives up.

**Where schedules live.** Schedules belong to the profile, listed in one place. A schedule may name a
project as the folder its agent starts in; without one, the agent sees only the profile's Memory and
Downloads. The schedule's page shows its runs' conversations, so "what did my email
sorting do on Tuesday" is found from the schedule. (2026-11-09 and 2026-11-11, owner: "the project is
only the agent's starting folder"; the no-project case is the design agent's proposal)

**Never archived.** Conversations, scheduled or not, are not archived when they finish or when their
tab closes; they stay in history. Hiding a conversation for good may come later as an action taken
from history. (2026-11-11, owner)

**Overlap.** While a schedule's previous run still waits for the person, the next run does not start;
the notification says today's run was skipped. (2026-11-08, owner, from the failure sweep)

**Rejected.**

- Archiving a scheduled run's conversation automatically when it finishes, as Paseo does
  ([history](history/DECISIONS.md#d29)) — in Paseo a scheduled agent looks like any other and, once
  archived, is hard to find again; here runs are found from their schedule instead (owner).
- Finishing the run and leaving a "I need your consent for X" message — proposed earlier by the design
  agent; loses the run's context and needs a second run, where an interactive session can simply
  continue.
- Per-schedule permission lists written at creation — the needs are not knowable in advance.

**Acting in the person's name.** No per-schedule switch. What a plugin can do outward is limited by
the tools it exposes — e.g. the mail plugin creates drafts and doesn't send, as in the owner's own
setup. Buying needs the person to sign in and pay, which is consent by itself. Payments as such are
out of scope. (2026-11-08, owner)

**Rejected.**

- A per-schedule "may send and publish in your name unattended" switch, with plugins marking
  outward-acting tools — proposed by the design agent; plugins exposing only safe tools does the job.

## D33

Retired in part 2026-11-11: "archived automatically when finished" dropped; rewritten in place as [D33](../DECISIONS.md#d33).

**The app's structure.** (2026-11-09, owner, on the design agent's proposals)

- **Sidebar:** profile switcher at the top, shown only once there is more than one profile; then
  "Waiting for you", Memory, Downloads, Plugins, Schedules, and the projects, with "App setup" an
  ordinary project pinned first.
- **Projects in the sidebar** expand to show their recent conversations, plus a view of the project's
  whole conversation history.
- **Main area has tabs** for whatever is open — conversations and files — opened and closed like an
  editor's tabs, not a store of every conversation (history lives under the project).
- **A project holds many conversations;** "New conversation" is one click. Scheduled runs are
  conversations too, archived automatically when finished.
- **"Waiting for you"** collects everything across the profile that needs the person: confirmations,
  a browser waiting for a login, sessions with a question, skipped runs.
- **Files** are edited without visible Markdown syntax (a rich editor such as Tiptap writing plain
  Markdown underneath); other files get a preview; a syntax view is an option, not the default.
- **Plugins** are one sidebar item with Installed and Marketplace beneath it; a plugin's page shows the
  projects it is attached to, what it knows about the person (links to its files), and "Set up again",
  which reruns its onboarding.

**Rejected.**

- One continuous conversation per project — results of schedules would need a separate place, and
  it grows forever.
- Tabs as the list of all open conversations (Paseo's model) — tabs here also hold files and are
  opened and closed constantly; history belongs under the project (owner).
- Schedules owned by projects — a project is only the folder an agent starts in (owner).
- Markdown syntax visible by default — most users don't know Markdown.

**Unchecked.** How faithfully Tiptap round-trips arbitrary Markdown the agent writes (tables, nested
lists, front matter).

# Retired decisions

Full text of decisions no longer in force, under their original IDs. Never edited after writing,
except to append the next retired form.

Retired in part 2026-11-11: the rejection of project-owned schedules reversed; rewritten in place as [D33](../DECISIONS.md#d33).

**The app's structure.** (2026-11-09, owner, on the design agent's proposals)

- **Sidebar:** profile switcher at the top, shown only once there is more than one profile; then
  "Waiting for you", Memory, Downloads, Plugins, Schedules, and the projects, with "App setup" an
  ordinary project pinned first.
- **Projects in the sidebar** expand to show their recent conversations, plus a view of the project's
  whole conversation history.
- **Main area has tabs** for whatever is open — conversations and files — opened and closed like an
  editor's tabs, not a store of every conversation (history lives under the project).
- **A project holds many conversations;** "New conversation" is one click. Scheduled runs are
  conversations too; nothing is archived ([D29](#d29)). The project's history is one list of all its
  conversations, scheduled runs marked as such; the sidebar's recent conversations show only those
  the person started or opened, plus any run that needs them, so runs don't crowd the workspace.
  (2026-11-11, the last clause is the design agent's proposal, not confirmed)
- **"Waiting for you"** collects everything across the profile that needs the person: confirmations,
  a browser waiting for a login, sessions with a question, skipped runs.
- **Files** are edited without visible Markdown syntax (a rich editor such as Tiptap writing plain
  Markdown underneath); other files get a preview; a syntax view is an option, not the default.
- **Plugins** are one sidebar item with Installed and Marketplace beneath it; a plugin's page shows the
  projects it is attached to, what it knows about the person (links to its files), and "Set up again",
  which reruns its onboarding.

**Rejected.**

- One continuous conversation per project — results of schedules would need a separate place, and
  it grows forever.
- Tabs as the list of all open conversations (Paseo's model) — tabs here also hold files and are
  opened and closed constantly; history belongs under the project (owner).
- Schedules owned by projects — a project is only the folder an agent starts in (owner).
- Markdown syntax visible by default — most users don't know Markdown.

**Unchecked.** How faithfully Tiptap round-trips arbitrary Markdown the agent writes (tables, nested
lists, front matter).

## D40

Retired in part 2026-11-14: installing is the plugin folder being there, no daemon-written list or broken state; rewritten in place as [D40](../DECISIONS.md#d40).

**Bundled plugins are mounted into the sandbox read-only from the app. Plugins the agent writes live in the profile, in
`/Piko/plugins/<name>/`, which the agent can write to. Installing any plugin is a request to the daemon, which
reads `plugin.json`, applies its additions to the environment and records the installation; the list of installed
plugins is the daemon's file, never edited by the agent. Editing a skill of an installed plugin takes effect in the next
conversation without reinstalling; changing what it adds to the environment needs a reinstall.** (2026-11-14, design
agent proposal, owner did not object)

**Why.** Plugins the agent writes outlive a rebuilt sandbox only if they sit beside the person's data, like Memory and
projects. The environment is rebuilt from the list of installed plugins ([D26](#d26)), so that list has to match what was
really installed, which only holds if one owner writes it. A missing folder of an installed plugin shows the plugin as
broken on its page and does not stop the environment from rebuilding.

**Shown with the others.** Plugins the agent wrote appear in the same list as bundled ones, marked as the person's own
("Twój plugin"), not as made by the agent — they asked for it, so it is theirs. (2026-11-14, owner)

**Rejected.**

- Hiding the agent's plugins from the Plugins list — the person would not know where a program in the environment came
  from, against the product's line that nothing is a black box ([D9](#d9)).
- Labelling them "made by the agent" — "your plugin" reads better and gives the person the sense they built it (owner).

Retired in part 2026-11-15: the agent no longer writes plugins of its own; what it builds lives in the project's setup, [D43](../DECISIONS.md#d43). Rewritten in place as [D40](../DECISIONS.md#d40).

**Bundled plugins are mounted into the sandbox read-only from the app, and the profile's manifest lists which of them
the person has installed. A plugin the agent writes is a folder in the profile, `/Piko/plugins/<name>/`: the
folder being there is what installs it, and deleting it uninstalls it. When the agent changes what one of its plugins
adds to the environment, it asks the daemon to apply the change. Editing a skill takes effect in the next conversation.
A plugin's programs are installed when the plugin is, never built into the sandbox's image.** (2026-11-14, owner,
simplified from the design agent's proposal at the review)

**Why.** Plugins the agent writes outlive a rebuilt sandbox only if they sit beside the person's data, like Memory and
projects. Installing needs no confirmation ([D28](#d28)), so routing it through the daemon would protect nothing; the
folders themselves are the record the environment is rebuilt from ([D26](#d26)). Programs stay out of the image because
a bundled plugin such as Blender, or a whole npm toolchain, would otherwise weigh on everyone who never uses it.

**Always the profile's.** A plugin the agent writes is installed for the whole profile, never into one project. Asking
the daemon to apply its environment is `piko plugin install <name>`, run in the sandbox. (2026-11-14, owner)

**Shown with the others.** Plugins the agent wrote appear in the same list as bundled ones, marked as the person's own
("Twój plugin"), not as made by the agent — they asked for it, so it is theirs. (2026-11-14, owner)

**Rejected.**

- Installing as a request to the daemon, which alone writes the list of installed plugins and shows a plugin with a
  missing folder as broken ([history](history/DECISIONS.md#d40)) — a gate with no safety behind it once installs need no
  confirmation (owner, 2026-11-14, at the review).
- Bundled plugins' programs built into the image, since they ship with the app anyway — every image would carry
  programs most people never use (owner, 2026-11-14).
- Hiding the agent's plugins from the Plugins list — the person would not know where a program in the environment came
  from, against the product's line that nothing is a black box ([D9](#d9)).
- Labelling them "made by the agent" — "your plugin" reads better and gives the person the sense they built it (owner).

## D42

Retired in part 2026-11-14: commands carry the plugin's name and the daemon stops the conversation deterministically; rewritten in place as [D42](../DECISIONS.md#d42).

**A workflow is started by invoking its plugin's skill as a command (e.g. `/email-sorting`), and a schedule's prompt is
that command, wherever the schedule was created — in the plugin's onboarding or in any later conversation. When the
command's skill is not available (its plugin was removed), the conversation gets an instruction from the app: the
command does not exist; stop, tell the person, and at most look for the cause (e.g. the plugin was removed); never try
to do the task another way, such as reading the plugin's files and redoing what it did. Removing a plugin touches no
schedule.** (2026-11-14, owner)

**Why.** Schedules do not know which plugin they use: one can be created in any conversation, so tying them to the
plugin that onboarded them is fragile. A missing command is a clean failure the person can see, while an agent that
improvises the missing workflow — as coding agents do when a skill is unavailable and they read its files instead —
does something nobody set up, after the person removed the plugin to stop it.

**Consequence.** Only installed plugins' folders are visible in the sandbox; a removed bundled plugin's files are not
left there to be read. A plugin installed but not attached to the current project stays findable ([D11](#d11)).

**Unchecked.** Whether OpenCode 2.2.7 invokes a skill as a slash command, or the daemon has to expand the command itself
when it starts the conversation.

**Rejected.**

- Removing a plugin lists the schedules of its projects to delete too — proposed by the design agent; unnecessary once a
  missing command fails cleanly.
- A schedule remembering which plugin created it and disappearing with it — schedules are created in any conversation,
  and one the person later reworked would vanish unasked (owner, 2026-11-14).

## D39

Retired in part 2026-11-14: `plugin.json` narrowed to what the platform acts on; rewritten in place as [D39](../DECISIONS.md#d39).

**A plugin is a folder: `plugin.json` (name, marketplace description in each app language, tags, level, the project it
creates, the plugins it needs, the accounts and services it uses, its MCP servers, its additions to the environment),
`skills/` (its skills, the onboarding skill among them) and, optionally, the package of its CLI ([D37](#d37)). Bundled
plugins ship as such folders inside the app ([D36](#d36)).** (2026-11-14, design agent proposal, owner did not object)

**Why.** Every part named in [D17](#d17) has one place, and a plugin the agent writes ([D26](#d26)) is the same folder.

## D26

Retired in part 2026-11-15: the agent's own installs go into a project's setup ([D43](../DECISIONS.md#d43)), and the manifest also takes the projects' declarations ([D44](../DECISIONS.md#d44)). Rewritten in place as [D26](../DECISIONS.md#d26).

**The profile's manifest — what the environment is rebuilt from — is the list of installed plugins
with their versions and configuration, plus the version of the base environment. The packages in the
sandbox are derived from what those plugins declare; nothing is copied out of plugins into a
hand-maintained package list.** (2026-11-08, owner)

**Why.** Installing a plugin is the primary way anything enters the environment, and the user chose
the plugin, not its packages. A package list in the sandbox describes what the sandbox is, not where
it came from, so it can't be rebuilt or updated from it. Since the marketplace is ours, plugin versions
and the dependencies they declare can be updated safely: updating means a new plugin version.

**Rejected.**

- The sandbox's own uv / Bun project files (with lockfiles) as the manifest — proposed by the design
  agent 2026-11-08; they record the result, not the source, and make updates awkward.
- Linux system packages from a repository frozen at a fixed date — proposed by the design agent; as
  a standalone rule it blocks updates (owner).

**Agent's own installs.** The agent can create local plugins: it writes a plugin manifest declaring
what it needs, and installing that plugin installs it — the same path as any plugin. (2026-11-08,
owner)

**Rejected.**

- A single fixed local plugin per profile ("My additions") holding everything the agent installs —
  proposed by the design agent; owner prefers letting the agent author plugins generally.
- A separate "installed by hand" section of the manifest — two kinds of entries for every mechanism
  to handle.

**Deferred until real plugins are built (owner).** How a plugin installs a Linux system tool: as a
distribution package via apt (version is whatever the base environment's distribution carries), as a
pinned release archive with a checksum (the plugin controls the version), or both as two kinds.
Neither is ruled out.

## D47

Retired in part 2026-11-16: `PROJECT.md` is for the person only; what the agent needs is in `.piko/AGENTS.md`. Rewritten in place as [D47](../DECISIONS.md#d47).

**Every project with a setup has a `PROJECT.md` in its folder: what the agent has built there, in plain words and the
person's language — what the project can do, what it installed and why. The agent keeps it current whenever it changes
the setup; the person can read and correct it like any file. The same text is the agent's index of the setup, loaded
into every conversation of the project; how to do things stays in the skills.** (2026-11-16, owner; one text for both
readers is the design agent's proposal)

**Why.** Someone opening the project should see what is there without opening a hidden folder, against the line that
nothing is a black box ([D9](#d9)). It is a file for people, not a technical one, so it does not clutter the project
the way `package.json` would. The agent needs to know a setup exists before it reads `.piko/`.

> **Checked 2026-11-16:** on OpenCode's `dev` branch, a relative entry in a global `opencode.json` `instructions` is
> searched from the session's directory up to the project root — "Relative patterns search upward from the location to
> the project root" ([instruction.ts](https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/core/src/config/plugin/instruction.ts)).
> So `"instructions": ["PROJECT.md"]` in the image's config loads each project's own file. It is watched and a change
> reaches a running session as a diff. Only `AGENTS.md` is found automatically. Not checked on 2.2.7, the version the
> sandbox runs; and its file watcher misses changes made from the host until a write from the VM side wakes it
> ([plugin runtime ADR](../../decisions/plugin-runtime-in-the-sandbox.md)), so a correction the person makes in the app
> may reach a running conversation late.

**Rejected.**

- The description inside `.piko/`, shown on the project's page in the app — the person could see and correct
  it only through a screen we would have to build (owner, 2026-11-16).
- `AGENTS.md` as the name — the owner chose `PROJECT.md`; OpenCode then needs it listed in `instructions`.
- Separate texts for the person and for the agent — the skills already tell the agent how; two descriptions would
  drift.

## D44

Retired 2026-11-16 at the rightsize review: plugins keep one shared environment; only a project's setup gets its own libraries. Rewritten in place as [D44](../DECISIONS.md#d44).

**Programs — Linux system packages and plugins' CLIs — are installed once for the whole sandbox, on one `PATH`, while
any installed plugin or any project's setup declares them. Libraries — npm and Python packages — are installed
separately for each place that holds code: each plugin, and each project's `.piko/`. Code uses only the
libraries its own place declares: a project's script does not use a library a plugin brought, even in the same project.
Every install draws from one shared cache, so a package used in several places is downloaded and stored once.**
(2026-11-15, design agent proposal, owner agreed)

**Why.** A script finds its libraries from where its file lies, not from the project the agent is working in, so
libraries already belong to places that hold code. A script that borrowed a plugin's library would break silently when
the plugin is removed or changes that library's version; and two plugins in one project cannot clash over a version.
Programs have one version each anyway: a bundled plugin has one version, and apt carries one version of a package.

**Rejected.**

> **Checked 2026-11-15:** Bun resolves a bare import by walking up from the importing file, ignoring the working
> directory (tested with Bun 1.4.4: `bun /abs/a/scripts/t.ts` run from `b/` took `a/node_modules`), and honours
> `NODE_PATH` — [Bun docs, modules](https://bun.sh/docs/runtime/modules): "Bun scans up the file system for a
> `node_modules` directory". Its install links from the cache by hardlink by default on Linux, the cache set by
> `BUN_INSTALL_CACHE_DIR` — [Bun docs, cache](https://bun.sh/docs/install/cache). Hardlinks need the cache and the
> installs on one file system (an OS limit; the docs only say `copyfile` is the fallback).
>
> **Checked 2026-11-15:** `uv run script.py` builds an environment from a PEP 723 header with no project files
> ([uv scripts guide](https://docs.astral.sh/uv/guides/scripts/)); a project's environment can live elsewhere through
> `UV_PROJECT_ENVIRONMENT`, one path per project ([uv project config](https://docs.astral.sh/uv/concepts/projects/config/)).
> uv's default link mode on Linux is clone, not hardlink — "Defaults to clone (also known as Copy-on-Write) on macOS
> and Linux" ([uv settings](https://docs.astral.sh/uv/reference/settings/#link-mode)) — and it copies when it cannot
> link, so `UV_LINK_MODE=hardlink` has to be set unless the volume supports clones.

**Rejected.**

- One shared environment for all libraries, as today — every library version shared by every plugin and project.
- A project's scripts using the libraries of the plugins installed in it — breaks silently when the plugin changes.

## D45

Retired 2026-11-16 at the rightsize review: plain `/<skill>` instead of `/:<skill>`. Rewritten in place as [D45](../DECISIONS.md#d45).

**A command for a skill of the project's own setup is `/:<skill>` — the plugin's name left empty means "this
project's setup". The daemon resolves it in the project the conversation belongs to and, as for a plugin's command
([D42](#d42)), stops the conversation with a fixed message when that project's setup has no such skill.** (2026-11-15,
owner, on the design agent's proposal)

**Why.** One grammar for every command: before the colon is where the skill comes from. A fixed form survives renaming
the project, and the daemon can still decide deterministically that a skill is missing.

> **Checked 2026-11-15:** OpenCode's skill id and name are plain branded strings with no character validation
> ([`packages/schema/src/skill.ts`](https://github.com/sst/opencode/blob/dev/packages/schema/src/skill.ts), `dev`
> branch); the folder scan skips only names starting with `.`. Unchecked: whether permission matching
> (`Permission.evaluate("skill", id, …)`, wildcard patterns) treats a leading `:` specially — to try live with the
> per-session deny rules before building. A folder named `:sort` is invalid on a Windows host, like every
> `<plugin>:<skill>` copy ([plugin runtime ADR](../../decisions/plugin-runtime-in-the-sandbox.md)).

**Rejected.**

- No prefix (`/sort`) — the daemon cannot tell a removed skill from one that never existed.
- A word as prefix (`/project:sort`) — owner preferred a special character.
- `/.sort` (reads as "here", but follows no existing form) and `/~sort` (`~` means home).

## D46

Retired 2026-11-16 at the rightsize review: Python dependencies in each script's header; the daemon rebuilds only with the sandbox. Rewritten in place as [D46](../DECISIONS.md#d46).

**A project's setup declares its libraries in the files the agent already knows, inside `.piko/`:
`package.json` with `bun.lock`, and one `pyproject.toml` with `uv.lock` for the whole project. The installed packages
live in the sandbox's volume, one folder per project id; `.piko/node_modules` and `.piko/.venv` are
symlinks to it. The agent installs libraries itself, with `bun add` / `uv add` in `.piko/`, which changes the
declaration and installs in one step; the daemon only rebuilds from the files — when the sandbox is rebuilt or a
project arrives from elsewhere — and recreates the symlinks. System programs are listed in a small file in
`.piko/`, and the agent asks the daemon to apply it with `piko apply`.** (2026-11-16, owner; one
`pyproject.toml` per project rather than per-script headers is the design agent's proposal, not yet confirmed)

**Why.** The agent is fluent in these tools, and the files remain the only source the environment is rebuilt from
([D25](#d25)), so a daemon in between would protect nothing. Lockfiles here are the source, not a record of the result:
the agent writes them ([D26](#d26)). Folders named by project id survive renaming the project. One Python file per
project keeps "what this project needs" in one place and matches JS. System programs need the whole sandbox rebuilt
from declarations, which only the daemon does.

> **Checked 2026-11-16 (macOS, Bun 1.4.4, uv 0.13.0):** with `.piko/node_modules` a symlink to another folder,
> `bun add is-odd@3.0.1` installed there and `bun <abs>/.piko/scripts/t.ts` resolved it from any working
> directory. With `.piko/.venv` a symlink, `uv add six==1.16.0` installed there; `uv run t.py` from
> `.piko/scripts/` found the project, but from the project's root it needs `uv run --project .piko`, which
> the agent's instructions say. Not yet repeated in the Linux sandbox on its volume.

**Open.** The format of the programs file waits for how a system program is installed ([D26](#d26), deferred). How
iCloud and Google Drive treat a dangling symlink is unchecked; it returns with cloud drives ([D22](#d22)).

**Rejected.**

- The agent edits the files and asks the daemon to install, as with plugins — a go-between with no protection behind
  it.
- Dependencies declared in each Python script's header (PEP 723, `uv run` builds an environment per script) — no single
  place showing what the project needs, and unlike JS.
- `UV_PROJECT_ENVIRONMENT` pointing at the volume — one value for the whole shell, while every project needs its own.

## D47

Retired 2026-11-16 at the rightsize review: no `PROJECT.md`; only `.piko/AGENTS.md`. Rewritten in place as [D47](../DECISIONS.md#d47).

**A project with a setup has two descriptions of it, one per reader. `PROJECT.md`, in the project's folder, is for the
person: in plain words and their language, what the project can do, what was installed for it and why. It is not
loaded into the agent's conversations; the app may show it to the person wherever it explains a project or what is
installed. `.piko/AGENTS.md` is for the agent: what the setup holds and how to use
it — which skills and scripts exist, how to run them (`uv run --project .piko …`) — with details in references
beside it and in the setup's own files. It is loaded into every conversation of the project. The agent keeps both
current whenever it changes the setup.** (2026-11-16, owner; the file name and place of the agent's text are the design
agent's proposal)

**Why.** Someone opening the project should see what is there without opening a hidden folder, against the line that
nothing is a black box ([D9](#d9)); a text written for them is not a good instruction for the agent, and the reverse.
The agent's text stays in `.piko/` with the rest of what only the agent needs, so the only file the person sees
is one written for them.

> **Checked 2026-11-16:** on OpenCode's `dev` branch, a relative entry in a global `opencode.json` `instructions` is
> searched from the session's directory up to the project root — "Relative patterns search upward from the location to
> the project root" ([instruction.ts](https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/core/src/config/plugin/instruction.ts)).
> So `"instructions": [".piko/AGENTS.md"]` in the image's config loads each project's own file. It is watched
> and a change reaches a running session as a diff. Only `AGENTS.md` in the directory itself or above is found
> automatically. Not checked on 2.2.7, the version the sandbox runs; and its file watcher misses changes made from the
> host until a write from the VM side wakes it ([plugin runtime ADR](../../decisions/plugin-runtime-in-the-sandbox.md)).

**Consequence.** Two texts can drift apart; nothing checks prose, so keeping them in step rests on the agent's
instructions.

**Rejected.**

- One text for both readers, `PROJECT.md` loaded into every conversation ([history](history/DECISIONS.md#d47)) —
  `PROJECT.md` is for the person (owner, 2026-11-16).
- The description inside `.piko/`, shown on the project's page in the app — the person could see and correct
  it only through a screen we would have to build (owner, 2026-11-16).
- The agent's `AGENTS.md` in the project's folder, where OpenCode finds it unaided — a second file in the person's view
  that is not written for them.

## D48

Retired 2026-11-16 at the rightsize review: the check covers only schedule commands. Rewritten in place as [D48](../DECISIONS.md#d48).

**`piko check`, run in the sandbox, tells the agent whether a project is consistent. The agent's instructions
have it run the check after every change to a project's setup or schedules. It checks only what needs no reading of
prose: every schedule's command exists (`/<plugin>:<skill>` of a plugin installed and visible in that project, or
`/:<skill>` of its setup); the declarations install (lockfiles match `package.json` and `pyproject.toml`, the programs
file parses); every skill file has a valid header and name.** (2026-11-16, owner's idea, scope proposed by the design
agent and agreed)

**Why.** The agent changes setups and schedules on its own, and a schedule calling a skill it renamed fails only at the
next run, possibly at night. A check it can run catches that while the conversation is still open. Checks that judge
prose would guess.

**Rejected.**

- Checking that skills refer to scripts that exist, or that `PROJECT.md` and `AGENTS.md` describe the setup as it is —
  needs reading prose; the check would guess.
