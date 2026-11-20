# Decisions

The decisions in force: grepped and re-entered, never read front to back. A heading is the
decision's ID alone, so `DECISIONS.md#d3` keeps resolving after the wording is sharpened. Retired
decisions, the journal and notes from reviews live in [history/](history/).

**Before proposing a change in an area, read the Rejected lines of its decisions and the history
they link to.** Reopening a rejected option is right when its premise changed; repeating it without
knowing it was rejected is not.

## D1

**The agent engine is OpenCode, run headless (`opencode serve`) and driven over its HTTP API.**
(2026-11-08, owner)

**Why.** Open source (MIT), provider-agnostic, and already has what the product needs underneath:
skills, subagents, custom agents, plugins with hooks, local and remote MCP with OAuth, an SSE event
stream and permission requests over HTTP.

> **Checked 2026-11-08:** `opencode serve` exposes sessions, messages, permissions, `/event` SSE, `/mcp`,
> `/agent`, provider auth; OpenAPI at `/doc` — [server docs](https://docs.opencode.ai/docs/server/).
> Skills from `.opencode/skills`, `.claude/skills`, `.agents/skills` —
> [skills](https://opencode.ai/docs/skills/). Subagents run in child sessions —
> [agents](https://opencode.ai/docs/agents/). License MIT; repo is now `anomalyco/opencode`, latest
> v2.2.6 (2026-11-06).

**Rejected.**

- Building on OpenWork (fork or contribution) — same engine and much of the plumbing, but aimed at
  companies replacing Cowork, onboarding assumes the user knows what to ask, no default sandbox;
  the product difference is in exactly the parts it would not give us (2026-11-08, design agent's
  reading of their README, owner agreed it is a Cowork clone).

## D2

**Sign-in uses the AI subscription the user already has: ChatGPT (Plus/Pro) and Claude (Pro/Max)
as equal options, API keys as a fallback.** (2026-11-08, owner)

**Why.** Paying for an API key is a step non-technical users won't take; both subscriptions now work
in OpenCode.

> **Checked 2026-11-08:** OpenCode v2.2.3 (2026-10-30) added the Claude Agent provider: it runs the
> user's own unmodified `claude` (Claude Code ≥2.1.248) via the Agent SDK, on the same machine as the
> OpenCode server; Claude Code's own settings/CLAUDE.md/hooks/MCP are not loaded; unavailable in
> OpenCode remote workspaces — [release](https://github.com/anomalyco/opencode/releases/tag/v2.2.3),
> reported by [dalao.ai](https://dalao.ai/news/a/w21FAWr86a) with the PR author's statement "We got
> permission from Anthropic". Anthropic's terms forbid third-party apps holding Claude credentials
> but allow "signing in to the unmodified Claude Code binary", also when a platform hosts it —
> [legal-and-compliance](https://code.claude.com/docs/en/legal-and-compliance).

> **Checked 2026-11-08:** OpenAI's Sign in with ChatGPT page lists OpenCode among open-source
> integrations; plan usage is open to open-source and personal-local apps, paid or remotely hosted
> apps go through a waitlist — [OpenAI](https://learn.chatgpt.com/docs/sign-in-with-chatgpt).

> **Checked 2026-11-13:** conversations run through the sandbox (OpenCode 2.2.7's `claude-agent` → Claude Code
> 2.1.322 in the container) on the owner's Max account succeeded with extra usage switched off, so they draw from the
> plan's limits. An OpenCode test transcript had shown "Third-party apps now draw from your extra usage, not your plan
> limits" (anomalyco/opencode#58782); it did not apply here.

**Consequences carried forward.** `claude` must live inside the sandbox next to OpenCode, and its
browser sign-in has to be surfaced by the app. Whether the Claude route works for cloud-hosted agents
is unchecked. A paid or hosted company offering may need OpenAI's waitlist.

## D3

**The first user is one person on their own computer; companies are where the money is expected to
come from, later.** (2026-11-08, owner)

**Why.** A product individuals like is easier to bring into their organisation. Company features
named so far: a shared team workspace with shared workflows, skills and full toolsets including
installed programs, cloud or intranet hosting, collaboration between people, custom development.
None of them is in scope now; the design must not rule them out.

## D4

**The product is opinionated about memory: the agent builds and keeps knowledge about the user in
plain files the user can read, out of the box.** (2026-11-08, owner)

**Why.** The owner's wife's setup worked because of this, not because of any one tool; it is what
she could not have built herself and what market products leave to the user.

## D5

**A daemon of ours runs in the background and exposes everything over a port; the desktop app is a
thin client of it. Daemon and client are kept clearly separate, but the daemon is not designed to be
replaceable by other implementations — how to customise it is decided later.** (2026-11-08, owner)

**Why.** The split serves the phone, the agent configuring the app from its sandbox ([D14](#d14)) and
a later cloud version. A replaceable daemon would make its whole API — sessions, files, schedules,
browser, plugins, sign-ins, relay — a public contract before anyone needs one: a company that only
wants its own file storage would have to rewrite all of it.

> **Checked 2026-11-08:** Paseo's daemon listens on `ws://127.0.0.1:6767`; desktop (Electron), mobile
> (Expo), web and CLI connect to it; remote access via an opt-in E2E-encrypted relay —
> [getpaseo/paseo](https://github.com/getpaseo/paseo), [security](https://paseo.sh/docs/security).

**Rejected.**

- The signed app working with any compatible daemon, local, remote or custom
  ([history](history/DECISIONS.md#d5)) — owner deferred replaceability (2026-11-08).
- Narrow replaceable parts inside the daemon (a file-storage provider, where the VM runs) as the
  customisation model — proposed by the design agent; not decided now, part of the later question.

## D6

**All agent work runs inside a Linux sandbox shipped with the app, one per profile; the user installs
nothing else, and the agent sees only the folders mounted into it. On macOS the sandbox is a Lima VM
with one container of ours inside, running the agent engine for every project of the profile.**
(2026-11-08, owner; per profile and the macOS runtime 2026-11-12, owner)

**Why.** The agent can install whatever it needs (Python, Node, Playwright…) without touching the
user's machine, and the environment can be described and rebuilt elsewhere. The profile is the only
hard boundary ([D8](#d8)), so one sandbox per profile is enough. Lima is the one runtime that ships
inside an app and is stable on macOS; the container image is the versioned description of the
environment, so a new environment is a new image and the VM stays.

> **Checked 2026-11-12:** Lima v2.3.0 (2026-11-06, Apache-2.0); `vz` is the default macOS driver since
> v1.0, virtiofs mounts need macOS 13+ — [vz](https://lima-vm.io/docs/config/vmtype/vz/),
> [mounts](https://lima-vm.io/docs/config/mount/); localhost ports in the guest are forwarded to the
> host automatically — [ports](https://lima-vm.io/docs/config/port/). Rancher Desktop ships `limactl`
> in its own resources (`pkg/rancher-desktop/backend/lima.ts`). Lima on Windows (`wsl2`, HCS) is
> experimental.

> **Checked 2026-11-08:** Cowork's local mode ran a Linux VM via Apple Virtualization.framework on
> macOS and Hyper-V/HCS on Windows, folders over VirtioFS —
> [Anthropic](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview);
> since 2026-10-06 Cowork defaults to cloud sandboxes. On Windows, enabling WSL / VM Platform the
> first time needs admin and a reboot — [Microsoft](https://learn.microsoft.com/en-us/windows/wsl/install);
> no admin-free path found. Community benchmarks put a minimal VZ VM boot at ~0.3–0.9 s.

**Open.** The Windows runtime.

**Rejected.**

- A sandbox per project — projects are not a hard boundary ([D8](#d8)), and each would hold its own
  VM's memory (2026-11-12, owner).
- Apple `container` on macOS — installed system-wide with an administrator password, no documented way
  to ship it inside an app; macOS 26 only (checked 2026-11-12,
  [apple/container](https://github.com/apple/container)).
- microsandbox (libkrun) — the only option claiming macOS and Windows alike, but beta with breaking
  changes announced (checked 2026-11-12).

## D7

**Multilingual from the start; Poland is the first market.** (2026-11-08, owner)

## D8

**Each project is its own folder. The agent working in a project works in that project's folder and
may look into the profile's other projects when it needs to; the only hard boundary is between
profiles.** (2026-11-08, owner; boundary 2026-11-12, owner)

**Why.** Separate folders keep projects movable and storable elsewhere independently. A project is a
way to keep work tidy, not a wall, so isolating projects from each other would buy nothing a person
wants and cost a sandbox per project ([D6](#d6)).

**What the agent sees.** The profile's projects, its Memory ([D9](#d9)) and its Downloads folder
([D27](#d27)) — never the rest of the computer. (2026-11-08; projects 2026-11-12)

**Rejected.**

- The agent seeing only its own project's folder ([history](history/DECISIONS.md#d8)) — owner
  (2026-11-12): isolation between projects is logical only.
- One vault per profile with projects as plain subfolders (the shape of the owner's wife's Obsidian
  setup) — proposed by the design agent 2026-11-08; owner chose separate folders, with knowledge about
  the person handled by [D9](#d9) instead.

## D9

**Each profile has a "Memory" (Pamięć): an ordinary folder of files about the person that the user can
open and edit like any project, and that the agent reads with ordinary file search in every project.
There is no other memory mechanism — not per profile, not per project.** (2026-11-08, owner)

**Why.** Memory that works "like Claude's" — hidden, opaque, managed by rules nobody can see — is what
the owner explicitly does not want. Nobody will think to create a "personal" project, so the app
provides the place. Inside a project nothing special is needed: a project is files, and the agent
organises them as the project requires.

**Open — file history.** Nothing yet lets the person undo a bad agent edit, stops two sessions
overwriting each other's changes to one file, or keeps a parallel run from rewriting a Memory fact
the person just corrected. Owner is considering a local git repository to keep history of the files
(2026-11-08, from the failure sweep).

**Rejected.**

- A name like "About me" (O mnie) — owner prefers "Memory" (2026-11-08).
- A managed memory store (embeddings, automatic summaries, a memory API) — opaque to the user.
- Showing Memory in a structure of its own (topics, sentences with their sources, cards to confirm) — Memory is
  shown as its files, opened like any project's files (2026-11-12, owner).
- A separate memory mechanism per project — a project is already just files.

## D11

**Projects organise work; they are not an isolation boundary. Per-project tool settings exist to keep
the agent's context small, not to restrict access.** (2026-11-08, owner)

**Why.** Examples: designing a wardrobe, shopping research, health and skin care, work, social media —
one project each. A hundred tools listed in every project crowds the agent's context; a project
should see the tools it needs by default, with the rest still findable.

**How.** A project's default tools are those of the plugins attached to it ([D20](#d20)); other
plugins stay findable, and attaching one to a project (by the user or the agent) makes its tools
default there. (2026-11-08, design agent proposal, owner agreed.)

**Rejected.**

- Counting tool usage per project and promoting frequent tools into a default set with a soft or hard
  limit (owner's first idea) — attaching plugins gives the same result with no counters.

**Deferred.** Shrinking what MCP servers put into the context — e.g. the agent sees which servers
exist and reads a server's tools only when it needs them. An optimisation for later (owner).

## D13

**Schedules run only while the computer is awake; running in the background regardless is the value
of the future cloud offering, and version one does not promise it.** (2026-11-08, owner)

**Why.** That is how the reference setup behaves today (routines arrive when the laptop is unlocked),
and it is acceptable.

**Missed runs.** A schedule whose time passed while the computer slept runs once on wake, for the
latest missed time only — a daily 7:00 routine after a closed weekend arrives once, Monday's.
(2026-11-08, design agent proposal, owner did not object.)

## D14

**Anything the user can configure in the app, the agent can configure too — connecting an account,
starting a sign-in, installing or reconfiguring a plugin — so the user never needs to find a settings
screen.** (2026-11-08, owner)

**Why.** Non-technical users won't find or understand configuration UIs; e.g. MCP sign-in in Claude
happens outside the chat, through a command and a click.

**Open.** Which agent-initiated changes need the user's confirmation in the UI (a web page the agent
read could ask it to install something).

## D15

**When the agent's browser hits something only the person can do — a login, a CAPTCHA — the agent
asks the person in the conversation, with a small screenshot; one click opens that exact tab live in
the app, the person does it and says so, and the agent continues.** (2026-11-08, owner)

**Why.** The agent has its own browser, never the user's (sessions exist only where the user signed
in for it); handing over the live tab is how it gets those sessions without the user knowing where
the browser is.

## D16

**One sign-in per external account per profile: connecting e.g. a Google account once serves every
plugin that needs it (Gmail, Calendar, Drive), each still a separate MCP server.** (2026-11-08, owner)

**Why.** Signing in again for every plugin is exactly the friction this product removes.

> **Checked 2026-11-08:** `gmail.modify` and `gmail.readonly` are *restricted* scopes —
> [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes). Public apps need OAuth
> verification; unverified apps get a warning screen and a lifetime cap of 100 new users; testing-mode
> grants expire after 7 days — [Google](https://support.google.com/cloud/answer/15549945). The annual
> CASA security assessment applies to apps that can access restricted data "from or through a
> third-party server"; no explicit on-device exemption found — unresolved, needs confirmation from
> Google — [restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).
> "Incremental authorization is not supported for installed apps or devices" —
> [native apps](https://developers.google.com/identity/protocols/oauth2/native-app): adding Calendar to
> an existing Google connection from a desktop app means a new consent screen (or asking for all
> scopes up front). Desktop clients are public clients; PKCE + loopback redirect. Microsoft Graph
> `Mail.ReadWrite` delegated needs no admin consent and works for personal accounts; unverified
> publishers show "Unverified" and may be blocked by tenant policy —
> [permissions](https://learn.microsoft.com/en-us/graph/permissions-reference).

**Consent.** Each Google service asks for its own consent when it is first added; the account is
connected once, a later service costs one more "Allow" on Google's screen. (2026-11-08, design agent
proposal, owner did not object.)

**Rejected.**

- Asking for all Google scopes (mail, calendar, Drive) at the first connection — Google does not let
  desktop apps add scopes later, but a first screen saying the app may read, send and delete all mail,
  calendars and files scares a non-technical user before any value is shown.
- All Google tools as one MCP server — too broad; acceptable only if individual endpoints can be
  switched on and off (owner, 2026-11-08).

## D17

**There is one kind of plugin, and it is a composite: any mix of skills, tools (a CLI or an MCP server, [D37](#d37))
with their configuration, an onboarding skill, additions to the sandbox environment (e.g. installing Blender), and
further parts as needed. "Workflow", "creative", "for work" are marketplace tags for filtering, not kinds. A plugin
declares no schedules: its onboarding has the agent create the ones the person wants.** (2026-11-08, owner; schedules
2026-11-14, owner)

**Why.** A 3D plugin that installs Blender and tells the agent it exists, and an email-triage plugin
with rules and a schedule, are the same thing with different parts; separate kinds would force a
choice nobody needs to make. When a schedule runs is the person's choice, made in the plugin's onboarding, so a
package cannot carry it; the agent can create schedules anyway ([D14](#d14)).

**Rejected.**

- Two kinds — a "connection" (account sign-in + tools, no files) and a "workflow" (rules, schedule,
  onboarding, creates a project) — proposed by the design agent 2026-11-08; owner prefers one
  composite with tags.
- Schedules as a part of the package ([history](history/DECISIONS.md#d17)) — the time is the person's to set in
  onboarding (owner, 2026-11-14).

## D18

**A plugin's onboarding is an ordinary chat driven by a skill the plugin's manifest marks to run right
after installation; the user can start it again any time to change the setup.** (2026-11-08, owner)

**Who starts it.** When the agent installs a plugin, it runs the onboarding skill itself, in the same conversation.
When the person installs one from the app, the daemon starts a new conversation in the project the app names, and the
agent opens it by running the onboarding skill. (2026-11-14, owner)

## D20

**A plugin has no folder of its own. Its files live in one or more ordinary projects, and the plugin's
configuration records which. A plugin can create a project when installed (e.g. "Email sorting") or be
installed from inside an existing project, which it then uses.** (2026-11-08, owner)

**Why.** Keeps one place for files — projects — and covers both a plugin that needs one dedicated
project and one that works across several.

**References survive renames.** A plugin points at a project by a stable identifier, not by name or
path. Deleting a project that has plugins or schedules attached warns and says what stops working.
(2026-11-08, owner, from the failure sweep)

**Projects are the onboarding skill's business.** A plugin declares no project ([D39](#d39)): whether it sets one up,
uses an existing one or several is written in its onboarding skill, and the agent does it with its ordinary tools. The
only project the platform records is where a project-level plugin is installed ([D34](#d34)), by its id in the
profile's manifest. (2026-11-14, owner)

**Rejected.**

- A per-plugin folder shown under the plugin, not as a project
  ([history](history/DECISIONS.md#d19)) — owner replaced it the same day with projects referenced
  from plugin configuration.
- Installing a plugin always creates its own project — too rigid; a plugin may use an existing project
  or several.

## D21

**The design describes the full first version: desktop app, plugins, a basic marketplace, the mobile
companion and the relay that connects it. In what order they are built is decided later and is not
part of this design.** (2026-11-08, owner)

**Rejected.**

- Fixing now that version one is desktop-only and the phone comes in version two
  ([history](history/DECISIONS.md#d12)) — owner moved sequencing out of the design.

## D22

**First run is a short wizard with only the formal steps — sign in to an AI provider (ChatGPT or
Claude), choose where the data lives — after which the app opens its first project, "App setup", and
the configuration plugin's onboarding chat starts on its own.** (2026-11-08, owner)

**Why.** Everything that can be a conversation is one; the wizard holds only what the conversation
cannot run without. Onboarding the user to the product is the configuration plugin's onboarding
([D18](#d18)).

**Order.** Set up the sandbox environment first (on Windows this is where the one-time admin consent
and reboot happen, before the user has put anything in), then sign in, then the "App setup" project.
Sign-in needs the sandbox because the Claude route signs in the `claude` program inside it ([D2](#d2)).
The first profile is created silently, unnamed; work/private comes up only when someone wants a
second profile. (2026-11-08, design agent proposal, owner agreed.)

**Where data lives.** The wizard asks for a kind of place, not a path: "On this computer", a default
folder the app picks (e.g. under Documents or home), changeable by those who want to. iCloud, Google
Drive and OneDrive come later as further kinds. (2026-11-08, owner)

**Rejected.**

- A folder picker in the wizard — the users this is for don't navigate folders.
- iCloud as the default — files evicted by "Optimize Mac Storage" and sync conflicts under an agent
  writing quickly are unexamined risks (not checked; design agent's concern).
- Rebooting for the sandbox at the first conversation instead of first — interrupts the moment the
  user has started.

## D23

**The chat supports generative UI: the agent can show choices, forms and other components that fit
the moment instead of making the user type everything.** (2026-11-08, owner)

**Why.** More general than the question tool coding agents use, and it removes typing for people who
don't know what to type. Owner named OpenUI as a candidate format.

> **Checked 2026-11-08:** OpenUI (thesysdev/openui, spec 1.0) — the model writes "OpenUI Lang", a
> line-oriented language, from a component library the app defines; the client renders it while it
> streams; a click can send a message back to the model (`@ToAssistant`), which the chat sends as a
> new user turn. Runtimes for React, Vue, Svelte, Angular, React Native —
> [spec](https://github.com/thesysdev/openui/blob/main/spec/overview.md),
> [chat UI](https://www.openui.com/docs/build-agents/chat-ui). The model learns it from a system
> prompt generated from the component library.

**How.** The agent writes the UI as an ` ```openui ` block at the end of its reply, and the app renders
it from the same text deltas as the rest of the reply, so it builds up while the agent writes. A
built-in skill, `generative-ui`, holds the syntax we support and one line per component; it is
generated from the app's component library (`@openuidev/lang-core` signatures) and read only when
needed — not a permanent system-prompt addition. A click or a submitted form is sent as the person's
next message. (2026-11-14, owner)

> **Checked 2026-11-14:** a tool registered by a local OpenCode 2.2.7 plugin reaches Claude through
> the `claude-agent` provider, but its input arrives whole (`session.tool.input.started`, then
> `ended` with empty text, then `called` with the full input — no `session.tool.input.delta`), so a
> tool could not render while the agent writes. A tool call also costs the model one more step (a
> request with the whole context) after it, and the program travels JSON-escaped.

**Rejected.**

- A built-in tool the agent calls to show UI (2026-11-08) — no streaming with the Claude provider,
  an extra model step per UI, escaped input (checked 2026-11-14, above).

## D24

**The sandbox comes with the basics built in: a Python runtime with uv, a JavaScript runtime with Bun,
and their package managers; a built-in skill tells the agent what is available and how to use it.**
(2026-11-08, owner)

**Why.** The agent should never have to install the language it writes scripts in.

## D25

**Everything beyond the basics is declared — by a plugin or in a project's setup ([D43](#d43)) — and the environment
is built only from those declarations. Each kind of thing (Python packages, JS packages, Linux system packages) has
exactly one way of being installed. Applying them is idempotent: the same result on the running sandbox and on one
built from scratch, e.g. after it was destroyed, after a runtime version change or after a serious failure.**
(2026-11-08, owner, on the design agent's proposal that the agent installs only by changing the manifest; where the
agent declares sharpened 2026-11-15, owner)

**Why.** The problem this product starts from is that an agent setup on one machine cannot be
reproduced on another, because nothing records what was installed. Imperative install scripts give
different results depending on order; a declaration per kind does not.

**Rejected.**

- A persistent sandbox where the agent installs freely — the manifest stops describing reality.
- A sandbox rebuilt from the manifest while the agent still installs freely — its installs silently
  vanish on the next rebuild.
- Install scripts run in sequence — results depend on order and history.

## D26

**What the environment is rebuilt from is the list of installed plugins with their versions and configuration, the
declarations in each project's setup ([D43](#d43)), and the version of the base environment. The packages in the
sandbox are derived from those; nothing is copied out of a plugin into a hand-maintained package list.** (2026-11-08,
owner; projects' declarations 2026-11-15, owner)

**Why.** Installing a plugin is the primary way anything enters the environment, and the user chose the plugin, not its
packages. A package list in the sandbox describes what the sandbox is, not where it came from, so it can't be rebuilt or
updated from it. Since the marketplace is ours, plugin versions and the dependencies they declare can be updated
safely: updating means a new plugin version.

**Rejected.**

- The sandbox's own uv / Bun project files (with lockfiles) as the profile's manifest — proposed by the design agent
  2026-11-08; they record the result, not the source, and make updates awkward. (A project's own setup may still use
  such files for its libraries: there the agent writes them, so they are the source — [D44](#d44).)
- Linux system packages from a repository frozen at a fixed date — proposed by the design agent; as a standalone rule
  it blocks updates (owner).
- A single fixed local plugin per profile ("My additions") holding everything the agent installs — proposed by the
  design agent; owner prefers the agent's work to live where it is used.
- A separate "installed by hand" section of the manifest — two kinds of entries for every mechanism to handle.
- The agent writing plugins of its own to install what it needs ([history](history/DECISIONS.md#d26)) — replaced by the
  project's setup (owner, 2026-11-15, [D43](#d43)).

**Deferred until real plugins are built (owner).** How a plugin installs a Linux system tool: as a distribution package
via apt (version is whatever the base environment's distribution carries), as a pinned release archive with a checksum
(the plugin controls the version), or both as two kinds. Neither is ruled out. A project's setup declares system
programs the same way, whichever is chosen.

## D27

**Each profile has its own Chromium on the host (its own user-data directory), separate from whatever
browser the user uses. The daemon launches it headed with its window hidden, so it works with the app
closed; the agent drives it from the sandbox through a tunnel the daemon provides. When a person is
needed, the app shows a thumbnail and one click brings that real window forward — the same process,
tab and page state. A remote client (the phone) sees the same tab as a screencast.** (2026-11-08,
design agent proposal, owner agreed)

**Why.** Schedules run with the app closed, so the browser cannot live in the app. Headless Chrome
cannot be made visible later, and restarting it headed loses the page state (CAPTCHA, paywall, a
half-done flow). The owner holds that a browser's own isolation is enough outside the sandbox; "inside
the app window" was a soft requirement, great UX the real one.

> **Checked 2026-11-08:** headless vs headed is fixed at launch —
> [Chrome headless](https://developer.chrome.com/docs/automation-and-testing/headless); OpenClaw's
> handoff restarts the profile headed, keeping cookies but not page state —
> [openclaw#75879](https://github.com/openclaw/openclaw/issues/75879).

> **Checked 2026-11-08:** Playwright MCP is headed by default ("headed by default") —
> [options](https://playwright.dev/mcp/configuration/options). On macOS each new Chromium page
> activates the app; `Target.createTarget` with `background: true` avoids that —
> [playwright#41282](https://github.com/microsoft/playwright/pull/41282) — but un-hides a hidden
> browser, so a re-hide watcher was needed —
> [hexisteme 2026-11-04](https://hexisteme.github.io/notes/playwright-new-page-brought-chrome-to-front.html).
> macOS won't place a window fully off-screen; `Browser.setWindowBounds` with `windowState:
> minimized` works — [playwright-cli#318](https://github.com/microsoft/playwright-cli/issues/318).

> **Checked 2026-11-08:** cost per task depends on how the agent gets the browser more than on the
> engine: median tokens/task Playwright MCP 31K, Chrome DevTools MCP 46K, agent-browser CLI with a
> short instruction 4–7K, equal accuracy —
> [doccraft.dev 2026-10-26](https://doccraft.dev/blog/playwright-mcp-vs-devtools-mcp-vs-agent-browser).

**The tunnel keeps the agent inside its boundary.** Chrome already refuses navigation from web pages
to `file://` (clicked links, scripts, redirects) with no override, so the remaining path is the
controller itself navigating there; the tunnel rejects `file://` targets in navigation commands.
Downloads are pinned with `Browser.setDownloadBehavior` (`downloadPath`, per browser context) to the
profile's Downloads folder, and the tunnel rejects attempts to change it. One browser per profile
means one download location, so it is per profile, not per project; the agent moves a file into a
project when it belongs there. (2026-11-08, owner agreed)

**Agents act in hidden windows.** Each agent session works in its own browser window, kept hidden;
a window is shown only for a handoff, while its agent waits. The person never clicks in a window an
agent is driving, and parallel agents don't share tabs; logins are shared because the profile's
cookies are. (2026-11-08, owner, from the failure sweep; per-session windows are the design agent's
reading of "the agent clicks in a hidden window")

**Keeping the window out of the way.** We launch the browser and every command passes the tunnel, so
we force background page creation, keep the window minimized and re-hide it if it surfaces. Fiddly on
macOS; worth an early prototype, since a browser that jumps to the front breaks "the agent works in
the background without getting in your way".

> **Checked 2026-11-08:** "Not allowed to load local resource" for `file://` navigation from
> non-file pages, no option to disable in Chrome —
> [textslashplain](https://textslashplain.com/2019/10/09/navigating-to-file-urls/);
> `setDownloadBehavior` takes `downloadPath` and `browserContextId` —
> [cdproto](https://github.com/chromedp/cdproto/blob/main/browser/browser.go).

**Rejected.**

- Chromium inside the sandbox, shown in the app as a screencast — no native window, passkeys and
  Touch ID likely unavailable; kept only as the remote view of the same browser.
- Headless browser restarted headed for the handoff — loses the page state.
- A Chromium fork — security releases every few weeks would have to be followed; a shipped stock
  build plus our launcher is enough.

## D28

**The agent may change anything inside its current reach without asking, installing plugins included: it reports each
plugin it installed in the conversation, with a link to the plugin's page. A new account connection needs no separate
confirmation either: the person going through the provider's sign-in and consent is the confirmation. A new schedule
that acts without a person, and a new destination in the browser tunnel, need the person's confirmation in the
conversation, batched: one confirmation covering everything the agent proposes at that point.** (2026-11-08, owner;
plugins and accounts 2026-11-14, owner)

**Why.** A web page the agent reads can try to instruct it ("install X, schedule daily mail to this
address"). A plugin gives the agent nothing it did not have inside the sandbox except through an account, and an
account cannot be connected without the person signing in. Plugin tools are built to keep the risk small (the mail
plugin creates drafts and never sends). Inside the sandbox and project nothing needs asking: the sandbox and the
tunnel are the boundary, unlike coding agents running directly on the computer.

**Open — [#35](https://github.com/kedrzu/poweragents/issues/35).** Whether the schedule and tunnel clauses stay. The
sandbox has open internet, so drafts-only tools stop sending in the person's name but not extraction; a schedule would
make a one-off leak repeat. The tunnel has no list of destinations, so its clause may protect nothing. Decided after
schedules and the browser are built, not in the plugins design.

**Confirmations come only from the app's interface** (a button the person presses), never as a
message in a conversation, whoever sent it — otherwise an agent steering another agent ([D30](#d30))
could approve on the person's behalf. (2026-11-08, owner, from the failure sweep)

**Accepted risk.** A plugin *update* that widens reach (e.g. adds sending to a drafts-only mail
plugin) is not caught; plugins are expected to be made carefully. (2026-11-08, owner, from the
failure sweep — owner doubts it can be detected reliably)

**Rejected.**

- A confirmation for every new plugin ([history](history/DECISIONS.md#d28)) — a plugin widens reach only through an
  account, whose sign-in already asks the person (owner, 2026-11-14).
- A separate confirmation per setting or plugin — too many clicks (owner).
- Letting the agent configure everything silently — one malicious page gets a lasting foothold.

## D29

**A scheduled run is an ordinary, visible, interactive session. It inherits the reach the project already has and
needs no permissions of its own; if it hits something that needs the person, it asks in that session
and waits, and the person is notified.** (2026-11-08, design agent proposal at the owner's request;
not confirmed)

**Why.** Defining permissions per schedule up front is impractical — what the agent will need is
decided while it runs — and unnecessary, because the reach is already set by the project's plugins
and connections ([D28](#d28)). A visible session lets the person see what happened and answer the
agent there, instead of a run that silently stalls or gives up.

**Where schedules live.** Every schedule belongs to a project, which is the folder its agent starts
in. One profile-wide Schedules page lists all of them, with their basic settings editable there. A
run's conversation is marked as coming from its schedule; the project's history can be filtered by
schedule, and the schedule's page shows its runs. (2026-11-11, owner)

**Never archived.** Conversations, scheduled or not, are not archived when they finish or when their
tab closes; they stay in history. Hiding a conversation for good may come later as an action taken
from history. (2026-11-11, owner)

**Overlap.** While a schedule's previous run still waits for the person, the next run does not start;
the notification says today's run was skipped. (2026-11-08, owner, from the failure sweep)

**Rejected.**

- Schedules owned by the profile, with a project optional and, without one, the agent seeing only
  Memory and Downloads ([history](history/DECISIONS.md#d29)) — no case needs a project-less schedule
  yet (even a cross-project morning brief can live in its own project and reach others through
  [D30](#d30)); add it when one appears (owner, 2026-11-11).
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

## D30

**Agents start, steer and watch other agents through the daemon, exposed to them as an MCP server the
way Paseo does it: create an agent in any project of the profile, send it a prompt, read its status
and activity, see the profile's projects.** (2026-11-08, owner)

**Why.** Lets work cross projects — the email-sorting agent finds a recruiter's reply and hands it to
an agent in the job-search project — beyond OpenCode's own subagents, which live inside one session.
Starting an agent in another project of the same profile does not widen reach ([D28](#d28)), since
projects are not walls ([D11](#d11)).

> **Checked 2026-11-08:** Paseo's MCP exposes `create_agent`, `send_agent_prompt`,
> `get_agent_status`, `list_agents`, `get_agent_activity`, workspaces, schedules and heartbeats;
> `daemon.mcp.injectIntoAgents` gives agents it launches access — [docs](https://paseo.sh/docs/mcp).

## D31

**Voice transcription is built in with a smart default model; which one is decided later and tuned
afterwards — anything reasonable for now.** (2026-11-08, owner)

## D32

**App translations use the nzyme i18n framework (`@nzyme/i18n`, `.loc.yaml` compiled to `.loc.ts`).**
(2026-11-08, owner)

> **Checked 2026-11-08:** present in this repository — `nzyme/packages/i18n`,
> `nzyme/packages/i18n-compiler` ("Compiles .loc.yaml translations to .loc.ts"), `nzyme/packages/vue-i18n`
> (INDEX.md).

## D33

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
- **Schedules** is one sidebar item: the profile-wide list of every project's schedules ([D29](#d29)).
- **Plugins** are one sidebar item with Installed and Marketplace beneath it; a plugin's page shows the
  projects it is attached to, what it knows about the person (links to its files), and "Set up again",
  which reruns its onboarding.

**Rejected.**

- One continuous conversation per project — results of schedules would need a separate place, and
  it grows forever.
- Tabs as the list of all open conversations (Paseo's model) — tabs here also hold files and are
  opened and closed constantly; history belongs under the project (owner).
- Markdown syntax visible by default — most users don't know Markdown.

**Unchecked.** How faithfully Tiptap round-trips arbitrary Markdown the agent writes (tables, nested
lists, front matter).

## D34

**A plugin is installed either for the whole profile or into a project. A plugin that gives general
access (e.g. Gmail: connect and read mail) belongs to the profile and is available in every project.
A plugin that is a specific workflow (e.g. email sorting) belongs to a project, and that project is
where the workflow keeps everything it needs — its rules, pending decisions, things waiting.
Usually one workflow per project ("Email" holds email sorting), but nothing enforces it.**
(2026-11-11, owner)

**Why.** "Email" is a perfectly good project: everything the agent needs to sort mail lives there, so
a workflow needs no space of its own. Access to Gmail, on the other hand, is useful in job search,
health (receipts) and anywhere else.

**The plugin's author decides its level**, and for now it cannot be changed: a profile plugin can't be
installed into a project, nor the reverse. (2026-11-11, owner)

**Needing a profile-level plugin.** A workflow plugin names the plugins it can work with ("Gmail or Outlook") in its
onboarding skill, not in its manifest ([D39](#d39)). How it works with them is decided per plugin, by evals: skills on each side that the agent
combines, a shared contract, or anything else that measures better. The design fixes no general rule. (2026-11-14,
owner)

**Consequence.** Profile-level plugins put their tools in every project, which [D11](#d11)'s
attachment was meant to avoid; keeping that small is the MCP-context optimisation already deferred
there.

**Rejected.**

- Every plugin attached to projects only — general access like Gmail would have to be attached to
  every project that ever needs mail (owner).
- One general rule for how plugins work together (skills only, or a shared contract per capability) — what works
  is measured case by case; a rule fixed now would block the better option later (owner, 2026-11-14).

## D35

**Conversations run on a mid-tier model by default: Sonnet with a Claude subscription, Terra with a ChatGPT one. The
person will be able to switch the model and its reasoning effort; until that switch exists, the default is fixed.**
(2026-11-13, owner)

**Why.** A default that answers quickly and spends the subscription's limits slowly suits everyday work; a harder task
is what the switch is for.

> **Checked 2026-11-12:** OpenCode 2.2.7's `claude-agent` integration offers `opus`, `fable`, `sonnet` and `haiku`
> (`GET /api/model` in the sandbox).
>
> **Checked 2026-11-14:** with a ChatGPT subscription signed in, OpenCode 2.2.7's `openai` provider offers Terra as
> `gpt-6.1-terra` (also `gpt-5.6-terra` and `-fast` variants); a session on it answered.

**Open.** Where the switch lives (per conversation, per project, per profile) and what reasoning effort maps to per
provider.

**Rejected.**

- The strongest model by default (Opus on Max) — proposed by the delivery agent; owner chose Sonnet (2026-11-13).
- Picking the model from the subscription's plan automatically — proposed by the delivery agent, not chosen.

## D36

**In the first version every marketplace plugin ships inside the app and takes the app's version; there is no separate
publishing, download or per-plugin versioning. The Plugins screen still looks like a marketplace from the start — a
list, search, tags — so the product shows where it is heading.** (2026-11-14, owner)

**Why.** How plugins are built, what they are made of and how they work matters now; how they are distributed and
updated does not yet. A store with its own releases is complexity with no case behind it today.

**Consequences.** A profile's manifest ([D26](#d26)) needs no per-plugin version for bundled plugins: the app's version
fixes them, and an app update updates every installed bundled plugin at once. Conflicts between bundled plugins are
resolved by us before release, not shown to the person.

**Rejected.**

- A marketplace with its own site, separately published packages and versions — later, if ever (owner, 2026-11-14).

## D37

**A plugin gives the agent tools as a command-line program by default — typically a small package of ours (JavaScript on
Bun) that provides a token-efficient CLI, with a skill telling the agent how to use it. MCP servers are supported too,
and the first Gmail plugin uses one because a ready-made server exists.** (2026-11-14, owner)

**Why.** MCP servers are expensive in context; a CLI the agent calls from its shell, described by a short skill, costs a
fraction for the same result.

> **Checked 2026-11-08** (see [D27](#d27)): median tokens per browser task — Playwright MCP 31K, Chrome DevTools MCP
> 46K, agent-browser CLI with a short instruction 4–7K, equal accuracy —
> [doccraft.dev 2026-10-26](https://doccraft.dev/blog/playwright-mcp-vs-devtools-mcp-vs-agent-browser).

**Rejected.**

- MCP as the default form of a plugin's tools — too costly in context (owner, 2026-11-14).

## D38

**Account sign-ins are held by the daemon, outside the sandbox. A plugin's tool asks the daemon for a short-lived access
token whenever it needs one; the long-lived refresh token never enters the sandbox.** (2026-11-14, design agent
proposal, owner agreed)

**Why.** A web page the agent reads can try to make it print what it holds. From the sandbox the worst leak is then an
access token valid for about an hour, not lasting access to the person's mailbox until they revoke it at Google. One
daemon endpoint serves every plugin with an account, and fits one sign-in per account per profile ([D16](#d16)).

> **Checked 2026-11-14:** OpenCode 2.2.7 lets a local MCP server take `environment` and a remote one `headers`
> (`packages/schema/src/mcp.ts:32,60` in anomalyco/opencode), so a token we obtain ourselves can be handed to an MCP
> server as well as to a CLI.

**Rejected.**

- The refresh token stored in the sandbox for tools to use directly — a leak means lasting access.

## D39

**A plugin is a folder: `plugin.json`, `skills/` (its skills, the onboarding skill among them) and, optionally, the
package of its CLI ([D37](#d37)). Bundled plugins ship as such folders inside the app ([D36](#d36)).** (2026-11-14,
design agent proposal, owner did not object)

**`plugin.json` holds only what the platform acts on:** the name, the marketplace text in each app language, tags, the
level (profile or project, [D34](#d34)), optionally the onboarding skill, and the additions to the environment with
pinned versions (the plugin's CLI package, npm packages, Python packages). How many projects a plugin sets up, where it
keeps what it learns and which plugins it works with are written in its onboarding skill, and the agent does them with
its ordinary tools. Accounts ([#50](https://github.com/kedrzu/poweragents/issues/50)) and MCP servers
([#52](https://github.com/kedrzu/poweragents/issues/52)) are added to it when they are built. (2026-11-14, owner)

**Why.** Every part named in [D17](#d17) has one place, and a project's own setup has the same parts ([D43](#d43)).
A field the platform does not act on is a promise nothing keeps; the agent already creates projects and reads skills,
so a workflow's setup needs no schema of its own.

**Rejected.**

- `plugin.json` also declaring the project a plugin creates, the plugins it needs and the accounts, services and MCP
  servers it uses ([history](history/DECISIONS.md#d39)) — nothing in the platform acts on the first two, and the rest
  wait for the work that builds them (owner, 2026-11-14).

## D40

**Bundled plugins are mounted into the sandbox read-only from the app, and the profile's manifest lists which of them
the person has installed. A plugin's programs are installed when the plugin is, never built into the sandbox's
image.** (2026-11-14, owner; the agent's own plugins removed 2026-11-15, owner)

**Why.** Programs stay out of the image because a bundled plugin such as Blender, or a whole npm toolchain, would
otherwise weigh on everyone who never uses it.

**Rejected.**

- Plugins the agent writes, as folders in `/Poweragents/plugins/<name>/`, always for the whole profile, shown in the
  Plugins list as "Twój plugin" ([history](history/DECISIONS.md#d40)) — the person asked for something done, not for a
  plugin; what the agent builds now lives in the project's setup ([D43](#d43)) (owner, 2026-11-15).
- Installing as a request to the daemon, which alone writes the list of installed plugins and shows a plugin with a
  missing folder as broken ([history](history/DECISIONS.md#d40)) — a gate with no safety behind it once installs need no
  confirmation (owner, 2026-11-14, at the review).
- Bundled plugins' programs built into the image, since they ship with the app anyway — every image would carry
  programs most people never use (owner, 2026-11-14).

## D41

**Each plugin is built as its own task, with its own evals; how it works with other plugins and which form its tools
take are settled there by measurement.** (2026-11-14, owner)

## D42

**A schedule is just a prompt; it knows nothing of plugins. A plugin's commands carry its full name as a prefix
(e.g. `/email-sorting:sort`), and plugin names are unique across all plugins, bundled and the person's own. When any
conversation — a scheduled run, a subagent, the person typing — receives a command whose plugin is not installed, the
daemon stops it before the agent acts, with a fixed message in the conversation saying that plugin is not installed.
The conversation stays open, with the original prompt and that message in it: the person can say "install it back",
and the agent knows what happened and continues. The agent never tries to do the task another way, such as reading the
plugin's files and redoing what it did. Removing a plugin touches no schedule.** (2026-11-14, owner)

**Why.** A schedule can be created in any conversation, so tying it to the plugin that onboarded it is fragile. A
command without a prefix that matches nothing does not say whether its plugin was removed or never existed; the prefix
does, so the daemon can decide deterministically rather than trusting the model to stop. An agent that improvises a
missing workflow — as coding agents do when a skill is unavailable and they read its files instead — does something
nobody set up, after the person removed the plugin to stop it. Keeping the conversation alive with its context lets
the person fix a removal made by mistake without starting over.

**Consequence.** Only installed plugins' folders are visible in the sandbox; a removed bundled plugin's files are not
left there to be read. A plugin installed but not attached to the current project stays findable ([D11](#d11)). The
agent cannot name a plugin of its own after a bundled one.

> **Checked 2026-11-14:** OpenCode 2.2.7's server does not expand `/name` in a prompt; only its clients (the TUI) do.
> A prompt takes `skills: [{id}]` and loads that skill into the turn. So the daemon recognises `/<plugin>:<skill>` and
> sends the prompt with that skill attached. A stopped command is admitted with `resume: false`, together with the
> fixed note: both wait in the session's inbox, start no run, and reach the agent with the person's next message.
>
> **Checked 2026-11-14:** `claude-agent` gets only OpenCode's tools, after its permission filter; Claude Code's own
> tools and skills are switched off. A tool denied as a whole never reaches the model, and a single skill denied by id
> leaves the model's skill list (live, through `claude-agent`). How per-project visibility is built on this:
> [plugin runtime in the sandbox](../../decisions/plugin-runtime-in-the-sandbox.md).

**Rejected.**

- An instruction injected into the conversation telling the agent to stop, with the model deciding
  ([history](history/DECISIONS.md#d42)) — an unprefixed command cannot tell removed from never existing, and stopping
  should not rest on the model (owner, 2026-11-14).
- The daemon checking a schedule's command before the run and starting no conversation — a schedule does not know it
  belongs to a plugin, and the person could not continue the run after reinstalling (owner, 2026-11-14).
- Removing a plugin lists the schedules of its projects to delete too — proposed by the design agent; unnecessary once a
  missing command fails cleanly.
- A schedule remembering which plugin created it and disappearing with it — schedules are created in any conversation,
  and one the person later reworked would vanish unasked (owner, 2026-11-14).

## D43

**What the agent builds with the person lives in the project where it is used, in a hidden `.poweragents/` folder of
that project: its skills, its scripts, the libraries those scripts use and the system programs the project needs.
This is the project's setup. The agent never writes plugins of its own. Plugins are what one installs, from the
marketplace; a project's setup is what one makes, by talking to the agent in that project.** (2026-11-15, owner)

**Why.** People do not set out to build a plugin; they want something done in a project ("my accounting", "3D
printing"). Keeping what the agent built in that project makes it easy to move, change and explain: Blender is in the
environment because the 3D printing project needs it. Projects are not an isolation boundary ([D11](#d11)), so a setup
that is useful elsewhere is simply copied.

**Only text in the project.** The folder holds what the agent wrote — skills, scripts, declarations — never installed
packages. They are installed in the sandbox and rebuilt from the declarations ([D25](#d25)). (2026-11-15, owner)

**No profile tier for own things.** The person's own plugins, kept in the profile and installed into several projects,
are a later design: the agent would turn a project's setup into one once the person wants it in several places
([plugins.md](plugins.md#still-open)). (2026-11-15, owner)

**Consequence.** Project-level plugins ([D34](#d34)) matter more: they bring programs the project then takes on.

**Rejected.**

- Installed packages (`node_modules`, a venv) inside `<project>/.poweragents/` — simplest for the agent, but hundreds
  of megabytes of Linux binaries in the person's folder, in their backups and, once data can live on a cloud drive
  ([D22](#d22)), in its sync; moving a project would carry them (owner, 2026-11-15).
- The agent writing its own profile-level plugins ([history](history/DECISIONS.md#d40)) — see [D40](#d40).
- Renaming "plugin" to something people would think of building — plugins stay what one installs (owner, 2026-11-15).

## D44

**Programs — Linux system packages and plugins' CLIs — are installed once for the whole sandbox, on one `PATH`, while
any installed plugin or any project's setup declares them. Plugins' libraries stay in the one shared environment the
daemon builds today. A project's setup has its own libraries, and its scripts use only those: never a library a plugin
brought, even in the same project. Every install draws from shared caches (Bun's, uv's) on the sandbox's volume, so a
package used in several places is downloaded and stored once.** (2026-11-16, owner, simplified at the rightsize review)

**Why.** A script finds its libraries from where its file lies, not from the project the agent is working in, so a
project's libraries already belong to its setup. A script that borrowed a plugin's library would break silently when
the plugin is removed or changes that library's version. Plugins need no separate libraries: they are all ours and
ship with the app ([D36](#d36)), so a version clash between them is caught before release. Programs have one version
each anyway.

> **Checked 2026-11-15:** Bun resolves a bare import by walking up from the importing file, ignoring the working
> directory (tested with Bun 1.4.4: `bun /abs/a/scripts/t.ts` run from `b/` took `a/node_modules`), and honours
> `NODE_PATH` — [Bun docs, modules](https://bun.sh/docs/runtime/modules): "Bun scans up the file system for a
> `node_modules` directory". Its install links from the cache by hardlink by default on Linux, the cache set by
> `BUN_INSTALL_CACHE_DIR` — [Bun docs, cache](https://bun.sh/docs/install/cache). Hardlinks need the cache and the
> installs on one file system (an OS limit; the docs only say `copyfile` is the fallback).
>
> **Checked 2026-11-15:** `uv run script.py` builds an environment from a PEP 723 header with no project files
> ([uv scripts guide](https://docs.astral.sh/uv/guides/scripts/)). uv's default link mode on Linux is clone, not
> hardlink — "Defaults to clone (also known as Copy-on-Write) on macOS and Linux"
> ([uv settings](https://docs.astral.sh/uv/reference/settings/#link-mode)) — and it copies when it cannot link, so
> `UV_LINK_MODE=hardlink` has to be set unless the volume supports clones.

**Rejected.**

- Separate libraries for each plugin too ([history](history/DECISIONS.md#d44)) — guards against a version clash
  between plugins we build and ship together ourselves (owner, 2026-11-16, rightsize review).
- A project's scripts using the libraries of the plugins installed in it — breaks silently when the plugin changes.

## D45

**A command for a skill of the project's own setup is its plain name, `/<skill>`. Every plugin command carries its
plugin's name before a colon ([D42](#d42)), so a command without a colon can only mean the setup of the project the
conversation belongs to. The daemon resolves it there and, as for a plugin's command, stops the conversation with a
fixed message when the setup has no such skill. A setup skill's name has no colon.** (2026-11-16, owner, at the
rightsize review)

**Why.** The form alone tells the daemon where to look, so it decides deterministically that a skill is missing, and
the name survives renaming the project.

**Consequence.** Two projects may each have a skill called `sort`, so the daemon's copies of setup skills
([plugin runtime ADR](../../decisions/plugin-runtime-in-the-sandbox.md)) need the project's id in their folder name,
with the daemon mapping `/sort` in a conversation to its project's copy. How exactly is for the build to settle,
together with whether OpenCode can find a project's skills in its folder by itself (unchecked).

**Rejected.**

- `/:<skill>`, an empty plugin name ([history](history/DECISIONS.md#d45)) — a folder named `:sort` is invalid on
  Windows and a leading `:` in permission matching was unchecked, for no gain once a missing colon already marks the
  project's setup (owner, 2026-11-16).
- A word as prefix (`/project:sort`) — owner preferred no word.

## D46

**A project's setup declares its JS libraries in `.poweragents/package.json` with `bun.lock`; `.poweragents/node_modules`
is a symlink to a folder for that project, by its id, in the sandbox's volume. Its Python scripts declare their
dependencies in their own header (PEP 723) and run with `uv run`, which builds their environments in uv's cache in the
sandbox. The agent installs libraries itself (`bun add` in `.poweragents/`), and when it finds a setup not installed —
e.g. a project that came from another machine — it runs `bun install` itself. The daemon reinstalls every project's
libraries only when it rebuilds the sandbox. System programs are listed in a small file in `.poweragents/`, and the
agent asks the daemon to apply it with `poweragents apply`.** (2026-11-16, owner; simplified at the rightsize review)

**Why.** The agent is fluent in these tools, and the files remain the only source the environment is rebuilt from
([D25](#d25)), so a daemon in between would protect nothing. Lockfiles here are the source, not a record of the result:
the agent writes them ([D26](#d26)). A folder named by project id survives renaming the project. Python's per-script
headers need no symlink, no `--project` flag and nothing from the daemon. System programs need the whole sandbox
rebuilt from declarations, which only the daemon does.

> **Checked 2026-11-16 (macOS, Bun 1.4.4, uv 0.13.0):** with `.poweragents/node_modules` a symlink to another folder,
> `bun add is-odd@3.0.1` installed there and `bun <abs>/.poweragents/scripts/t.ts` resolved it from any working
> directory. Not yet repeated in the Linux sandbox on its volume, nor with the symlink dangling (a project from another
> machine) before `bun install`.

**Open.** The format of the programs file waits for how a system program is installed ([D26](#d26), deferred). How
iCloud and Google Drive treat a dangling symlink is unchecked; it returns with cloud drives ([D22](#d22)).

**Rejected.**

- One `pyproject.toml` with `uv.lock` per project and `.venv` a symlink ([history](history/DECISIONS.md#d46)) — needs
  the symlink, `uv run --project .poweragents` everywhere and the daemon rebuilding Python; its argument, one place
  showing what the project needs, was the design agent's (owner, 2026-11-16, rightsize review).
- The daemon detecting a project that arrived from elsewhere and installing it — no way to detect it was ever
  described; the agent installing on first need costs one install's time.
- The agent edits the files and asks the daemon to install, as with plugins — a go-between with no protection behind
  it.
- `UV_PROJECT_ENVIRONMENT` pointing at the volume — one value for the whole shell, while every project needs its own.

## D47

**A project with a setup has `.poweragents/AGENTS.md`, for the agent: what the setup holds and how to use it — which
skills and scripts exist and how to run them — with details in references beside it and in the setup's own files. It
is loaded into every conversation of the project, and the agent keeps it current whenever it changes the setup. There
is no separate description for the person: asked what a project can do, the agent explains it from that file.**
(2026-11-16, owner)

**Why.** The agent needs to know a setup exists before it reads `.poweragents/`. A text for the person had no case
strong enough to justify a second file to keep in step; it can be added when one appears.

> **Checked 2026-11-16:** on OpenCode's `dev` branch, a relative entry in a global `opencode.json` `instructions` is
> searched from the session's directory up to the project root — "Relative patterns search upward from the location to
> the project root" ([instruction.ts](https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/core/src/config/plugin/instruction.ts)).
> So `"instructions": [".poweragents/AGENTS.md"]` in the image's config loads each project's own file. It is watched
> and a change reaches a running session as a diff. Only `AGENTS.md` in the directory itself or above is found
> automatically. Not checked on 2.2.7, the version the sandbox runs; and its file watcher misses changes made from the
> host until a write from the VM side wakes it ([plugin runtime ADR](../../decisions/plugin-runtime-in-the-sandbox.md)).

**Rejected.**

- `PROJECT.md` in the project's folder, for the person, besides the agent's file
  ([history](history/DECISIONS.md#d47)) — not enough reason for a second text to keep in step; added later if needed
  (owner, 2026-11-16).
- One text for both readers, `PROJECT.md` loaded into every conversation — a text for the person is a poor instruction
  for the agent (owner, 2026-11-16).
- The agent's `AGENTS.md` in the project's folder, where OpenCode finds it unaided — a technical file in the person's
  view.

## D48

**`poweragents check`, run in the sandbox, tells the agent whether every schedule of a project calls a command that
exists: `/<plugin>:<skill>` of a plugin installed and visible in that project, or `/<skill>` of its setup. The agent's
instructions have it run the check after every change to a project's setup or schedules.** (2026-11-16, owner's idea;
scope narrowed at the rightsize review)

**Why.** The agent changes setups and schedules on its own, and a schedule calling a skill it renamed fails only at the
next run, possibly at night. A check it can run catches that while the conversation is still open.

**Rejected.**

- Also checking that lockfiles match and skill headers parse ([history](history/DECISIONS.md#d48)) — `bun add` keeps
  lockfiles in step and OpenCode validates headers when it loads a skill (owner, 2026-11-16, rightsize review).
- Checking that skills refer to scripts that exist, or that `AGENTS.md` describes the setup as it is — needs reading
  prose; the check would guess.
