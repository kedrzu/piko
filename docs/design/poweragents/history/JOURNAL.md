# Journal

Append-only. One line per turn that settled something, was rejected, or got an answer from the owner.

- 2026-11-08 — Session opened. Owner's brief (Polish, long) captured: an agent harness on top of
  OpenCode for non-technical users. Problem: non-technical users stop at ChatGPT/Claude chat or
  Cowork-style apps with a few plugins; they don't know skills exist, don't know they'd want them, and
  lack the confidence to ask an agent to build a workflow. Setting up what power users have (workspace,
  repo, AGENTS.md, skills, Python/Node runtime, Playwright, …) is too much. Owner's stated shape:
  one installable app; built-in agent-controlled Chromium shown inside the app (user can log in there,
  agent never gets the user's own browser); plugin marketplace (Gmail, Google Docs, …) with ready
  *workflows*, not just connectors (example: daily email triage with labels and learning); projects as
  folders of markdown files browsed/edited in-app like Obsidian, storage location abstract (local
  default; Google Drive / iCloud / private cloud later); onboarding that interviews the user (who are
  you, what do you do, what could an agent help with) implemented as a rerunnable "configuration"
  plugin of skills; sign-in with ChatGPT or Claude subscription; daemon + thin client like Paseo, the
  signed desktop client works with any daemon (local, remote, custom); open source; all agent work runs
  sandboxed in a bundled container runtime (no user-installed Docker), only project folders mounted;
  one reproducible manifest (compose-like) describing the whole agent environment, portable to another
  machine or a cloud; profiles (work / private) with runtime per profile, per-project isolation at
  config level only (owner's lean, asked whether it's needed); built-in voice transcription with a
  smart-default model; multilingual, Polish market first; schedules, agent-to-agent communication and
  orchestration (like Paseo MCP). Later: mobile companion app with notifications, cloud-hosted agents.
  Owner asked: what else matters for usability for non-technical users.
- 2026-11-08 — Dispatched three checks: OpenCode subscription sign-in status and server API; embeddable
  sandbox runtimes on macOS/Windows; Paseo architecture and existing products (Cowork, OpenWork).
  Nothing folded into README yet beyond the opening.
- 2026-11-08 — Check returned (Paseo / market): Paseo is Apache-2.0, daemon on ws://127.0.0.1:6767,
  clients (Electron desktop, Expo mobile/web, CLI) connect to it, E2E-encrypted opt-in relay, MCP with
  agent/schedule/heartbeat tools, plain-file storage under ~/.paseo. OpenWork (different-ai/openwork,
  MIT outside ee/, ~24k stars) is already "open-source Cowork alternative built on OpenCode": Electron,
  OpenCode server on :4096, skills via OpenPackage, ChatGPT sign-in, built-in browser; sandboxing and
  scheduling only partial; desktop schedules need the app open. Cowork moved to cloud sandboxes by
  default (local VM only for pre-2026-10-06 tasks). ChatGPT Work exists (2026-11-06). No local-first
  product has a hard sandbox by default. Not yet put to the owner.
- 2026-11-08 — Owner was asked: (1) did they know OpenWork and what put them off; (2) write the
  "what is different" scene together. Framed the fork: build own daemon-first product vs start from
  OpenWork and spend effort on onboarding/workflows/Polish market/sandbox. No answer yet.
- 2026-11-08 — Check returned (OpenCode / sign-in). Claude: Anthropic forbids third-party apps offering
  claude.ai login or holding Claude tokens (code.claude.com/docs/en/legal-and-compliance, fetched
  2026-11-08); carve-out: an end user signing in to the *unmodified* Claude Code binary, also when a
  platform hosts it; requires Commercial Terms. OpenCode v2.2.3 (2026-10-30) added a "Claude Agent"
  provider that drives the user's own `claude` login — this is what the owner meant by "Claude login in
  OpenCode". ChatGPT: OpenAI's Sign in with ChatGPT page lists OpenCode among open-source integrations;
  plan usage allowed for open-source and personal-local apps, paid/hosted apps go through a waitlist.
  OpenCode: MIT, repo now anomalyco/opencode, `opencode serve` HTTP+SSE API, OpenAPI at /doc, JS SDK,
  skills in .opencode/.claude/.agents skills dirs, subagents, custom agents, plugins with hooks, MCP
  local+remote with OAuth. Latest v2.2.6 (2026-11-06).
- 2026-11-08 — Check returned (sandbox runtimes). Cowork (pre-cloud) used Virtualization.framework on
  macOS and its own HCS VM + SYSTEM service on Windows, VirtioFS for folders, vsock for control (Anthropic
  architecture page + third-party analyses). Options: Virtualization.framework directly; libkrun/krunkit
  (Apache-2.0, no Windows yet); Apple `container` (macOS 26 + Apple silicon only, needs sudo for host
  DNS); microsandbox (beta, libkrun); WSL2 import of own rootfs (first-time feature enable needs admin +
  reboot, no admin-free path found). Minimal VZ VM boots ~0.3–0.9 s in community benchmarks; Cowork VM
  allocated ~4 GB RAM; partial memory ballooning on macOS. CDP: Chrome rejects non-IP/localhost Host
  headers → relay inside guest over vsock is the practical shape. Not yet put to the owner.
- 2026-11-08 — Owner corrected me: Claude subscriptions do work in OpenCode now. Re-checked: correct.
  OpenCode v2.2.3 (2026-10-30) Claude Agent provider runs the user's unmodified `claude` via the Agent
  SDK; OpenCode contributor on PR #58782: "We got permission from Anthropic and everything here is fully
  tos compliant" (reported by dalao.ai 2026-10-31; no separate Anthropic announcement). Constraints from
  OpenCode docs as reported: Claude Code ≥2.1.248 on the same machine as the OpenCode server; Claude
  Code's own settings/CLAUDE.md/hooks/MCP not loaded; not available in OpenCode remote workspaces.
  My earlier "won't work as you imagine" was wrong in direction; the real consequences are where
  `claude` runs (inside our sandbox) and how its browser sign-in reaches the user.
- 2026-11-08 — Owner doesn't know OpenWork, sees it as a Cowork clone, asked how it differs from our
  assumptions. Read their README (fetched 2026-11-08): positions itself as Cowork alternative with
  "Migrate from Claude Cowork"; business model is OpenWork Den (org control plane, RBAC, team skill
  marketplace, MCP gateway; source-available, free ≤5 users).
- 2026-11-08 — Owner gave the scene: his wife on Paseo + Claude Code with a basic CLAUDE.md and an
  Obsidian vault where the agent keeps memory about her; LinkedIn job-search schedule, Instagram post
  design, and a self-built health/skin-care assistant sending daily routines. Individual is the entry
  point; money from companies later (shared workspaces, toolsets, cloud/intranet, collaboration, custom
  development). Differentiation: opinionated memory / "digital twin". Folded into README ("What is
  different", "Who it is for"). DECISIONS.md created with D1–D7 (engine, sign-in, audience, memory,
  daemon+client, sandbox, multilingual).
- 2026-11-08 — Owner: projects are separate folders (D8, rejecting my one-vault-per-profile
  recommendation); memory about the person global across projects in a profile (D9, mechanism open);
  wife gets notifications via a Telegram bot today, which needed setup → mobile companion from the
  start (D10). Owner asked about relay (Paseo) vs Headscale tunnel without a VPN on the phone.
- 2026-11-08 — Owner: relay/mobile deferred; v1 desktop-only local, mobile in v2 soon after (D12,
  retires D10). Memory = "Pamięć", a plain folder of files per profile, agentic search, nothing magic,
  nothing per project (D9 rewritten). Projects organise work, not isolation; per-project tool visibility
  to keep context small, idea of usage-based promotion with a limit (D11, mechanism open). Schedules
  only when awake; background running is the cloud offering's value (D13).
- 2026-11-08 — Owner: MCP context size deferred as a future optimisation (idea: progressive
  disclosure — agent sees which servers exist, reads a server's tools only when it needs them).
  Plugins are post-v1 but discussed: made of skills, MCP servers with config, preferences, additions
  to the sandbox environment (dependencies), idempotent onboarding when installed and on demand,
  possibly their own file space (project-like, less visible), dependencies on other plugins (soft,
  e.g. by mail provider chosen at onboarding; hard if useful). Email triage example: provider-agnostic
  skill, onboarding asks which provider and runs its sign-in, many rules about what goes where.
  Recorded D14 (agent can configure anything the app can), D15 (browser handoff for login/CAPTCHA),
  D16 (one sign-in per account per profile). Dispatched check on Google restricted Gmail scopes /
  CASA and Microsoft equivalents.
- 2026-11-08 — Proposed to owner (not yet confirmed): split plugins into "connection" (one per account
  per profile: sign-in, MCP, maybe a usage skill, no files) and "workflow" (rules, schedule, onboarding;
  installing it creates a visible project, e.g. "Maile", rules are files there; needs a connection of a
  kind, not a specific provider). Google check returned and attached to D16: gmail.modify restricted →
  verification needed past 100 users; CASA possibly avoidable for local-only, unresolved; no incremental
  auth for desktop apps.
- 2026-11-08 — Owner rejected the connection/workflow split: one composite plugin, tags only (D17);
  onboarding = skill marked in manifest to auto-run after install, rerunnable chat (D18); plugin data =
  plain files in the plugin's own folder, shown under the plugin, not a project, because projects feel
  time-bounded (D19). Google consent-per-service recommendation not answered yet.
- 2026-11-08 — Owner: turning one's own project into a plugin is out of scope for now; typical users
  won't author plugins; authoring model unknown. Plugin files live in projects referenced from the
  plugin's configuration; a plugin may create a project at install or be installed into an existing
  one; may use several (D20, retires D19). Still unanswered and recorded nowhere as decided: Google
  consent per service when added; missed schedule runs → run once, latest.
- 2026-11-08 — Owner: plugin attachment decides a project's default tools (D11 sharpened). Silence
  taken on consent-per-Google-service (D16) and missed-run-once (D13). Sequencing out of the design:
  design the full first version incl. plugins, marketplace, mobile, relay (D21, retires D12). First
  run: wizard with sign-in + data location, then first project "App setup" with the configuration
  plugin's onboarding chat (D22). Generative UI in chat, OpenUI candidate (D23, checked).
- 2026-11-08 — Owner: OpenUI as built-in tool + skill with spec and supported components (D23 how);
  data location "on this computer" default folder, changeable, cloud drives later; sandbox → sign-in →
  App setup order and silent first profile agreed (D22). README: "The first run" section added.
- 2026-11-08 — Owner: Python+uv and Bun built into the sandbox with a skill (D24); everything else in
  the manifest, one install method per kind (JS, Python, Linux), idempotent on running and fresh
  sandbox, no order-dependent scripts (D25). Format still open.
- 2026-11-08 — Owner rejected uv/Bun project files as manifest and frozen apt date (block updates;
  describe the container, not its source). Manifest = installed plugins (versions, config) + base
  environment version; packages derived from plugin declarations; marketplace controls versions (D26).
- 2026-11-08 — Owner: agent installs by authoring its own local plugins (D26). Owner read my "system
  packages move with the base environment" as "Blender preinstalled in base" — clarifying: the point
  was apt versions come from the distro release; open question how a plugin pins a system tool version.
- 2026-11-08 — Owner: system-tool install method (apt vs pinned archive) deferred until real plugins, neither ruled out (D26).
- 2026-11-08 — Browser discussion. Owner: browser may live outside the sandbox (its own isolation is
  enough), must be a separate Chromium we control, not the user's browser; agent drives it through a
  tunnel from the sandbox; "inside the app window" is a soft requirement, great UX is the real one;
  asked whether a headless session can be shown later as the *same* session (JS state, CAPTCHA,
  paywall), whether a custom Chromium build makes sense, and heard DevTools is cheaper than Playwright.
  Checked 2026-11-08: headless/headed is a launch flag, cannot switch a running Chrome
  (developer.chrome.com/docs/automation-and-testing/headless; OpenClaw issue #75879 does stop→start
  headed with the same profile, losing page state). Same-session options: headed Chrome with a hidden
  window shown on demand, or CDP screencast of the live tab. Token cost (doccraft.dev 2026-10-26, 19
  tasks ×2): median tokens/task Playwright MCP 31K, Chrome DevTools MCP 46K, agent-browser CLI with a
  short AGENTS.md block 6.9K, with 3 rules + output cap 4.1K; all equally accurate — the interface
  (CLI + short instructions vs MCP) matters more than the engine; "DevTools is cheaper" not supported.
- 2026-11-08 — Owner agreed browser shape (D27). Owner asked: file:// clicks, forcing downloads into the project, Playwright window always on top. Checked and attached to D27.
- 2026-11-08 — Owner agreed: tunnel blocks file:// navigation, profile-level Downloads folder visible to agent (D8, D27), window-hiding work + early prototype. README: browser section.
- 2026-11-08 — Owner: no replaceable daemon for now; build our own, kept separate from the client; customisation later (D5 rewritten, old form to history).
- 2026-11-08 — Owner: reach-widening changes need confirmation, batched by the agent (D28). Asked whether scheduled sessions should be visible/interactive like Paseo, whether permissions can be defined at schedule creation, whether escalation works in an interactive session → recorded D29 as proposal (interactive session, inherits project reach, escalates and waits); open: outward actions in the person's name.
- 2026-11-08 — Owner: no per-schedule outward-action switch; plugins expose safe tools (mail: drafts only); buying needs login = implicit consent; payments out of scope (D29).
- 2026-11-08 — Owner: agent orchestration via daemon MCP like Paseo (D30); voice model deferred, anything for now (D31); i18n via nzyme i18n (D32). Next: failure sweep.
- 2026-11-08 — Failure sweep run; classified in history/2026-11-08-failure-sweep.md; six credible failures put to owner.
- 2026-11-08 — Sweep dispositions recorded (D9 open file history, D20, D27, D28, D29).
- 2026-11-09 — Owner closed screen-level questions (D33): many conversations, sidebar expands project to recent conversations + full history, editor-style tabs for conversations and files, Waiting-for-you inbox, rich Markdown editor (Tiptap), Plugins item with Installed/Marketplace, schedules per profile with optional starting project (D29). Next: UI briefs.
- 2026-11-09 — UI briefs written: ui/first-run.md, ui/daily-work-in-a-project.md, ui/installing-a-plugin.md; README section 'What the person sees' links them.
- 2026-11-11 — Owner will design the main screen first, then onboarding. Added a 'day one' state to ui/daily-work-in-a-project.md (onboarding lands on the main screen).
- 2026-11-11 — Owner: workflows like email sorting are projects; plugins installed at profile level (general access, e.g. Gmail) or project level (workflow, keeps its info in the project), usually one workflow per project, not enforced (D34). Scheduled runs never archived, found from the schedule's page; one history list (D29, D33 rewritten; old forms to history). Proposed: sidebar recents show only person-started/opened conversations + runs needing them.
- 2026-11-11 — Owner: plugin level set by author, not changeable for now (D34). Schedules belong to projects; profile-wide Schedules page for overview and basic settings; runs marked, project history filterable by schedule (D29, D33 rewritten, reverses 2026-11-09 profile-owned schedules). Sidebar-recents proposal accepted.
- 2026-11-12 — Daily-work design round 1 in the app: screen 11 finished, screens 12–18 for the brief's states and failures, five Variants frames (19–33) for the owner to pick; log in history/daily-work-in-a-project.md.
- 2026-11-12 — Owner picked the daily-work variants: Waiting card stays, schedule header, files in the sidebar plus a side view from the conversation, agent waits only while she edits. Memory is plain files with no view of its own (D9 Rejected updated, brief clarified); the sidebar says Memory again, per D9.
- 2026-11-12 — Delivery start (working agent). Owner: one sandbox per profile; isolation between projects logical only, agent may look into other projects (D6, D8 rewritten, old forms to history); runtime left to the delivery agent — Lima on macOS, Windows later (D6); agent runs without approvals inside the sandbox, as D28 already says.
- 2026-11-12 — First-run design round 1 in the app: screens 35–41 (preparing the environment, its failure, connecting Claude with the pasted code and its failures, connected) and a `First run · components` frame; log in history/first-run.md.
- 2026-11-13 — Design round from .context/projects-brief.md: first-run screens synced with the build (round 5 in history/first-run.md, new 50 and `atoms/Check badge`); projects in the first working version, screens 51–55 with a projects-only sidebar and a new-project dialog; log in history/projects.md.
- 2026-11-13 — Owner: Sonnet by default with Claude, Terra with ChatGPT; a model and reasoning-effort switch later (D35).
- 2026-11-13 — Conversations design round from .context/conversation-brief.md: screens 56–61 (agent working, finished, a project's conversations with *Nowa rozmowa* in the sidebar, the agent could not answer, signed out of Claude, usage limit) and five step and error molecules; log in history/conversations.md.
- 2026-11-13 — Checked with the owner: sandbox conversations draw from the Claude plan, not extra usage (D2).
- 2026-11-14 — Memory and App setup design round from .context/memory-app-setup-brief.md: screens 63–66 (Memory with files and empty, day one in App setup and the sidebar filling in), a sidebar with the Memory entry, the Memory file row and a "new" project row; log in history/memory-and-app-setup.md.
- 2026-11-14 — Plugins design session (#25) started. Proposed to the owner: a plugin is three things — the package
  (immutable, versioned contents), the installation (a profile manifest entry: version, level, config, attached
  projects, account) and its data (files in projects, owned by the person); updates replace the package, never data.
  Raised the tension in D28: "a new plugin needs confirmation" vs "inside the sandbox nothing needs asking"; offered A
  (confirmation follows the parts — accounts, unattended schedules, tunnel destinations) vs B (every plugin), recommended A.
  Checked 2026-11-14 against anomalyco/opencode v2.2.7 source (subagent, local clone): per-directory config merged over
  global (`packages/core/src/config/discovery.ts`); per-agent and per-session `permission` rulesets with wildcards
  (`"mymcp_*": "deny"`, `permission.skill`), session API takes `permissions` (`packages/protocol/src/groups/session.ts:176,308`);
  `OPENCODE_CONFIG_CONTENT`/`OPENCODE_CONFIG_DIR` process-wide; `PUT /api/experimental/mcp/:server` adds an MCP server
  at runtime per directory; `claude-agent` gets OpenCode's tools incl. MCP as one in-process MCP server `opencode`,
  Claude Code's own tools/settings off (`specs/v2/claude-agent-provider.md`, `.../claude-agent/claude/query-options.ts:62-104`);
  MCP OAuth tokens in `opencode.db`, local MCP takes `environment`, remote `headers` (`packages/schema/src/mcp.ts:32,60`);
  OpenCode JS plugins add nothing for visibility. Unverified: a denied tool never reaching claude-agent's offered list.
- 2026-11-14 — Owner: no real marketplace in v1 — plugins ship with the app, versioned with it; UI looks like a
  marketplace (list, search); distribution and updates are not the focus, how plugins are built and work is (D36).
- 2026-11-14 — Owner: plugin tools default to token-efficient CLIs (often a Bun package giving a CLI plus skills), MCP
  supported, Gmail starts as MCP (D37). Owner on confirmations: the only gate a plugin install needs is the account
  sign-in itself (the person goes through the provider's consent); the agent installs plugins on its own and reports
  it, e.g. a generative-UI card linking to the plugin page. Not yet answered: schedules out of the package; whether
  unattended schedules and tunnel destinations still need confirmation (D28 rewrite pending).
- 2026-11-14 — Owner: tools get short-lived tokens from the daemon, refresh token stays out of the sandbox (D38);
  schedules are not part of a plugin package, onboarding creates them (D17 rewritten, old form to history). Owner's
  safety line: tools are built to minimise injection and extraction risk (Gmail: drafts only). Raised: the sandbox has
  open internet (`packages/daemon/src/sandbox/buildHostFirewall.ts` closes only private ranges), so drafts-only stops
  sending in the person's name but not extraction.
- 2026-11-14 — Owner: schedule confirmation and the tunnel clause are not the plugins design's to settle (a parallel
  agent builds schedules); follow-up issue #35 created (Backlog, blocked by #21, #25). D28 rewritten for plugins:
  installs need no confirmation (agent reports them with a link), account connection is confirmed by the sign-in
  itself; schedule and tunnel clauses kept as they were, open in #35. Old D28 to history.
- 2026-11-14 — Owner: a workflow plugin names the plugins it works with, no shared interface; the agent combines their
  skills (D34 Open closed). Plugin folder shape (plugin.json, skills/, optional CLI package) recorded as proposal, owner
  did not object (D39).
- 2026-11-14 — Owner corrected: no general rule for how plugins work together; per plugin, by evals (skills, contract,
  whatever measures better). D34 clause rewritten in place the same day (the "no contract" form never held).
- 2026-11-14 — Owner: agent-written plugins on the same list, labelled "Twój plugin" (D40, location and install flow as
  proposal, not objected); each plugin is its own build task with its evals (D41).
- 2026-11-14 — Owner: schedules call a plugin's skill as a command; a missing command fails cleanly with an app-injected
  instruction to stop, report and at most diagnose, never improvise; removal touches no schedule (D42). Next: README
  plugins chapter, brief update, rightsize.
- 2026-11-14 — Story folded: new chapter plugins.md, README Plugins section and link replacing "D11 still open";
  ui/installing-a-plugin.md updated (no schedule in the package, no approval step, agent's install card, "Twój plugin",
  conflict state replaced by broken own plugin, removal keeps files and schedules). Next: rightsize.
- 2026-11-14 — Rightsize (three passes) put to the owner: keep daemon-held sign-ins (D38), keep programs out of the
  image (D40), keep profile/project levels (D34); agent plugins are folders, no daemon-written list or broken state
  (D40 rewritten); commands prefixed with the plugin's unique name, the daemon stops a conversation whose plugin is
  missing with a fixed message, conversation stays open to continue after reinstalling (D42 rewritten). Old forms to
  history.
- 2026-11-14 — Owner closed the plugins design (#25). Open: #35 (schedule and tunnel confirmations), apt vs pinned archive (D26). Unchecked for the first build task: OpenCode skill-as-command (D42), denied tools hidden from claude-agent.
- 2026-11-14 — Toasts and app update design round from .context/app-updates-brief.md: `molecules/Toast` with tone, lifetime and action variants, `molecules/Toaster`, the update toast (ready, restarting, install failed), a busy Primary button, screens 67–69; log in history/app-updates.md.
- 2026-11-15 — Project-scoped setup round opened (owner's idea): what the agent builds with the person lives in the
  project's hidden `.poweragents/` (skills, scripts, Python/JS deps, declared apt packages), not as an agent-written
  profile plugin (would retire D40's own plugins, revisit D25/D26). Plugins stay "things you install". Owner chose:
  the project folder holds only text; installed packages live in the sandbox, per project, rebuilt from declarations;
  every install draws from shared caches (Bun, uv). No profile tier for own things: reuse across projects is copying,
  until the person wants it in several places — then the agent extracts the project's setup into their own plugin,
  kept in the profile and installed into projects. Project-level plugins matter more now: they carry dependencies the
  project takes on. Not yet folded into DECISIONS/plugins.md.
- 2026-11-15 — Owner: building the person's own plugins (extracting a project's setup) is out of scope for now; noted
  in plugins.md "Still open" with the schedule-repointing consequence and the owner's idea of a check the agent runs
  after its changes (schedules point at existing commands, declarations installed). Open in this round: programs
  global vs libraries per code location; how a project's own skill is named as a command.
- 2026-11-15 — Owner agreed: programs (system packages, plugin CLIs) shared on one PATH, libraries installed per place
  that holds code, from one shared cache, no borrowing a plugin's library (D44); project-setup commands are `/:<skill>`
  (D45). Recorded D43 (project's setup in `.poweragents/`, text only, agent writes no plugins); D40 and D26 rewritten,
  old forms to history; D25 sharpened. Checks (Bun resolution, NODE_PATH, Bun/uv caches, OpenCode skill ids) recorded
  in D44/D45; leading `:` in permission matching still to try live. Folded into plugins.md. Code still implements the
  agent's own plugins (`packages/daemon/src/env.ts`, `PluginService`) — divergence for the build.
- 2026-11-16 — Declarations and how scripts find libraries: tested on macOS (Bun 1.4.4, uv 0.13.0) that `bun add` in
  `.poweragents/` with `node_modules` a symlink to another folder installs there and a script resolves through it from
  any cwd; `uv add` with `.venv` a symlink does the same, `uv run` finds the project from a script's folder but not from
  the project root (needs `--project .poweragents`). Proposed to owner: native files + lockfiles in `.poweragents/`,
  install folders symlinked to the sandbox volume per project id, agent uses `bun add`/`uv add` itself, programs via a
  small file and a daemon apply. Not recorded as a decision yet.
- 2026-11-16 — Owner: the agent installs libraries itself; system programs through a file and `poweragents apply`.
  Recorded D46 (one pyproject per project is the design agent's, flagged unconfirmed). Next offered: the human
  description of a project's setup, and the check the agent runs after its changes.
- 2026-11-16 — Owner chose a visible description file, named `PROJECT.md` (D47); OpenCode `instructions` lookup
  checked on `dev`, not on 2.2.7; host edits may reach a running session late (watcher). Check after the agent's
  changes (`poweragents check`: schedule commands exist, declarations install, skill files parse) proposed, awaiting
  owner.
- 2026-11-16 — Owner: `PROJECT.md` is for the person only; the agent's guidance belongs in AGENTS.md and references.
  D47 rewritten (old form to history): agent text at `.poweragents/AGENTS.md` (design agent's proposal), loaded via
  `instructions`. Asked owner what "techniczny plik używany w różnych sytuacjach" means for PROJECT.md.
- 2026-11-16 — Owner confirmed: PROJECT.md may be shown by the app where it explains a project (D47 sharpened); the
  check's scope agreed, recorded as D48. Blocking questions closed; next: rightsize before proposing to close.
- 2026-11-16 — Rightsize (three passes) put to the owner, who took every recommendation and dropped PROJECT.md:
  plugins keep one shared library environment, only setups get their own (D44); plain `/<skill>` for setup skills,
  copies need the project id (D45); Python per-script PEP 723 headers, agent installs a missing setup, daemon only at
  sandbox rebuild (D46); only `.poweragents/AGENTS.md`, no PROJECT.md (D47); check covers schedule commands only
  (D48). Old forms to history; plugins.md updated. Kept without asking (owner already chose): programs declared per
  project, shared caches, an agent-facing AGENTS.md. Ready to propose closing.
- 2026-11-16 — Owner closed the project-setup round (PR #61). To confirm live before building: `node_modules` symlink
  on the sandbox volume (and dangling), `.poweragents/AGENTS.md` via `instructions` on OpenCode 2.2.7, how setup skill
  copies avoid colliding across projects (D45). Deferred: programs file format (D26), the person's own plugins. Code
  still implements agent-written plugins (D40 divergence).
