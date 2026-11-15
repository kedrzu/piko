# Decisions

The decisions in force: grepped and re-entered, never read front to back. A heading is the
decision's ID alone, so `DECISIONS.md#d3` keeps resolving after the wording is sharpened. Retired
decisions, the journal and notes from reviews live in [history/](history/).

**Before proposing a change in an area, read the Rejected lines of its decisions and the history
they link to.** Reopening a rejected option is right when its premise changed; repeating it without
knowing it was rejected is not.

## D1

**Two goals, in this order: the person's account is not banned, and the agent finishes its task instead of stopping
at a block or CAPTCHA. It is one real person on their own accounts, on any site, at a human scale.** (2026-11-15,
owner)

**Why.** The owner's cases: agentic Allegro searches trip a CAPTCHA after some number of actions and the task stops;
X bans accounts for automation. The person may use any site, so nothing may assume a known list of sites.

> **Checked 2026-11-15:** X's automation rules list "Use non-API-based forms of automation, such as scripting the X
> website. The use of these techniques may result in the permanent suspension of your account." (primary page
> `help.x.com/en/rules-and-policies/x-automation` returned 403; quoted by a secondary source). X ToS forbids access
> "by any means (automated or otherwise) other than through our currently available, published interfaces" —
> [x.com/tos](https://x.com/en/tos).

**Rejected.**

- Many identities (rotating fingerprints, proxies, profiles), as scraping tools do — that is not the product, and for
  a logged-in account a changing identity is itself suspicious.
- Tuning for a fixed list of sites (Allegro, X) — the person may use any site.

## D2

**Stealth means consistency with the real machine: the browser presents its real fingerprint (canvas, WebGL, fonts,
screen, OS) and removes only what says "automated". Nothing is spoofed beyond that.** (2026-11-15, design agent
proposal, owner agreed)

**Why.** One person on a real Mac or PC is, by definition, consistent; a spoofed fingerprint introduces mismatches
that detectors look for. Residential IP, a persistent profile with real logins, and a real Chromium's TLS fingerprint
come for free.

> **Checked 2026-11-15:** CloakBrowser's Allegro block (issue #16) was Linux system fonts leaking through a spoofed
> Windows persona; its maintainer on #471: "the main way it shows up is IP reputation" —
> [CloakBrowser](https://github.com/CloakHQ/CloakBrowser).

**Rejected.**

- Fingerprint spoofing engines (CloakBrowser, Camoufox, Helium's noise patch) — they hide many identities; for one
  real person they add inconsistencies.

## D3

**The agent's browser stays Chrome for Testing driven over CDP through the daemon's pipe, launched with
`--disable-blink-features=AutomationControlled`.** (2026-11-15, design agent proposal, owner agreed)

**Why.** It keeps agent-browser and the daemon's CDP multiplexer, which enforces the agent's limits
([pipe ADR](../../decisions/agent-browser-over-one-pipe.md)). The pipe alone sets `navigator.webdriver = true`; the
flag turns it back off without giving up the pipe. Keeping up with Chrome stable is a one-line pin bump
(`packages/daemon/src/browser/chromiumRelease.ts:20`, at stable 157.0.8103.78).

> **Checked 2026-11-15:** `{wrf::EnableAutomationControlled, switches::kRemoteDebuggingPipe, true}` in
> [runtime_features.cc](https://chromium.googlesource.com/chromium/src/+/main/content/child/runtime_features.cc);
> local test on CfT 158 headed macOS with the pipe: `navigator.webdriver` true without the flag, false with it.

> **Checked 2026-11-15:** CfT reports only `Not.A/Brand` and `Chromium` in `userAgentData.brands` (no "Google
> Chrome"), has proprietary codecs, and shows a non-removable "Chrome for Testing" banner in browser UI —
> [CfT README](https://github.com/chromium/chromium/blob/main/docs/chrome_for_testing/README.md). The brand is a
> layer to fix ([D4](#d4)).

**Rejected.**

- CloakBrowser — closed-source binary, licence key per launch, "no redistribution (OEM/SaaS license required to serve
  third parties)" — [licence](https://github.com/CloakHQ/cloakbrowser/blob/main/BINARY-LICENSE.md).
- Camoufox or any Firefox — Firefox removed CDP as of 141
  ([fxdx.dev](https://fxdx.dev/cdp-retirement-in-firefox/)), so agent-browser (Firefox only in open PR
  [#2205](https://github.com/vercel-labs/agent-browser/pull/2205)) and the multiplexer would go.
- Bundling Google Chrome — not allowed without Google's written permission (Chrome ToS 9.2).
- Launching the person's installed Chrome with our own profile — correct brand, but no control over the version and
  nothing for people without Chrome. Reopen if the brand proves unfixable over CDP.
- Agent-oriented browsers: Ardia (Helium + agent-browser, macOS Apple Silicon only), Yab (closed, WebKit, macOS only,
  no CDP), Helium and Zen (privacy browsers, no agent features; Zen has no CDP). Their agent layer is the one we
  already have.
- Headless agent engines (Obscura, Lightpanda) — headless, no persistent profile, own fingerprint; Lightpanda loaded
  5/9 protected pages vs Chrome 7/9 in a third-party test.
- Native web views — WKWebView has no CDP and a default UA detectably short of Safari's
  ([webkit.org](https://webkit.org/blog/13936/enabling-the-inspection-of-web-content-in-apps/)); WebView2 has CDP
  and looks like Edge, but it would mean two engines and two control stacks for a gain on Windows only.
- CEF — one major behind stable and only the Chromium brand; nothing over CfT.
- Driving the person's own Chrome through an extension, as Claude in Chrome does — it is the same CDP, reached
  through `chrome.debugger`; what differs is the person's real profile, which poweragents rejected for the agent
  ([poweragents D27](../poweragents/DECISIONS.md#d27)).

  > **Checked 2026-11-15:** Claude in Chrome's control permission is `debugger` — "allows Claude to actually control
  > your browser" ([support](https://support.claude.com/en/articles/12012173-getting-started-with-claude-in-chrome));
  > Claude Code reaches it through a native messaging host and the `claude-in-chrome` MCP server, and it "shares
  > your browser's login state"; on a CAPTCHA "it pauses and asks you to handle it manually"
  > ([docs](https://code.claude.com/docs/en/chrome)). The extension debugger API exposes `Runtime`, `Input`,
  > `Page` and others ([chrome.debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger)).
- Our own patched Chromium now — see [D7](#d7).

## D4

**Stealth is built in the daemon, in layers every browser client gets. Built first, regardless of measurement: the
launch flag ([D3](#d3)), the guarantee that page scripts never observe our code ([D8](#d8)) and pace ([D5](#d5)).
Built only once the eval shows sites react to them, in the order it shows: input (mouse paths and per-key typing
generated from the agent's clicks and text) and the "Google Chrome" brand set over CDP on every target, workers
included.** (2026-11-15, design agent proposal; the split by measurement is the owner's choice after the rightsize
review)

**Why.** Every CDP command already passes the daemon's multiplexer, so a fix there covers agent-browser, site helpers
in any language, and anything later. Vendors document client-side JS fingerprinting first and behaviour second (HUMAN:
"user-interaction anomalies within mouse clicks, screen touches, cadence and timing" —
[docs](https://docs.humansecurity.com/applications/bd-detection-overview)).

> **Checked 2026-11-15:** agent-browser v0.43.0 sends `Runtime.enable` on every page
> (`cli/src/native/browser.rs:1040`); a click is one `mouseMoved` plus press and release at the element centre
> (`cli/src/native/interaction.rs:59-94`); `type` sends `Input.insertText` per character, key events only for
> Enter/Tab — [agent-browser](https://github.com/vercel-labs/agent-browser).

**Rejected.**

- Building input and brand layers up front — no evidence yet that either affects blocks; the owner chose measurement
  first ([history](history/DECISIONS.md#d4)).
- Fixing only the CDP leaks the measurement shows — the owner wants no traces regardless of measurement
  ([history](history/DECISIONS.md#d4)).
- Stealth inside each client (Patchright, rebrowser-patches, ghost-cursor per helper) — every client and every
  language would need its own copy; the daemon sees all traffic once.
- In-page JS patches (puppeteer-extra-plugin-stealth style) — detectable themselves; that plugin is abandoned since
  2023 and named as detected in DataDome's docs.

## D5

**The daemon enforces a human pace on every site, and slows down when a page shows a CAPTCHA or block; the agent is
told when it is being paced.** The pace values and back-off rules are set from the
baseline measurement on Allegro, not guessed up front. How the daemon recognises a block is open. (2026-11-15,
design agent proposal, owner agreed; adaptive from the first version is the owner's choice)

**Why.** Blocks after N actions (30 Allegro searches in two minutes) come from volume per session and IP, which no
fingerprint fix changes. Enforced in the daemon, the agent cannot skip it; telling the agent keeps it from treating
the wait as a broken browser. A generic pace fits "any site" ([D1](#d1)).

**Rejected.**

- Per-site limits only — needs a known list of sites.
- Pace as an instruction to the agent — a hurried agent ignores it.
- A fixed per-site interval first, with CAPTCHA back-off added later — the owner wants the adaptive behaviour from
  the first version (rightsize review, 2026-11-15).

## D6

**Stealth is measured by a repeatable eval over a panel of real protected sites covering the major vendors
(Cloudflare, DataDome via Allegro, Akamai, HUMAN, Kasada, reCAPTCHA v3) plus fingerprint test pages. A layer stays only
if it improves the panel. Ban risk is not measured; it is handled by rules.** (2026-11-15, design agent proposal, owner
agreed)

**Why.** "As good as possible" ([D1](#d1)) needs a number. CAPTCHA rate and actions-until-block are measurable on
the real site; bans are delayed and account-level, and nobody tests them on real accounts.

> **Checked 2026-11-15:** live test pages:
> recaptcha-demo.appspot.com/recaptcha-v3-request-scores.php,
> antcpt.com/eng/information/demo-form/recaptcha-3-test-score.html, abrahamjuliot.github.io/creepjs,
> bot.sannysoft.com, fingerprintjs.github.io/BotD/main, browserscan.net/bot-detection, demo.turnstile.workers.dev,
> bot-detector.rebrowser.net, deviceandbrowserinfo.com/are_you_a_bot. No public DataDome test page found; allegro.pl
> sets a `datadome` cookie, so Allegro is the DataDome test.

**Rejected.**

- Test pages alone — they check single leaks, not whether a real vendor lets the agent through.
- Allegro and a few test pages only, adding a vendor when the agent is blocked by it — the owner wants coverage of
  every major vendor from the start, for "any site" (rightsize review, 2026-11-15).

## D7

**We build our own patched Chromium only if the eval shows a leak that neither a launch flag nor the CDP layer can
fix; then we start from Helium's patch pipeline.** (2026-11-15, design agent proposal, owner agreed)

**Why.** Shipping a Chromium is done; building a modified one is a permanent pipeline: per build 100 GB+ disk, 16 GB+
RAM, "20+ [cores] is not excessive", about an hour on 16 cores, on macOS and Windows, signed, for a milestone every two
weeks plus weekly security refreshes. A browser holding the person's logins that lags security fixes is worse than one
that gets detected. Helium shows a one-day lag is achievable; GPL does not touch our app, since the browser runs as a
separate program.

> **Checked 2026-11-15:** build requirements —
> [Windows build docs](https://chromium.googlesource.com/chromium/src/+/main/docs/windows_build_instructions.md);
> two-week milestones since Chrome 153 — [Chrome blog](https://developer.chrome.com/blog/chrome-two-week-release);
> lag vs stable 157.0.8103.78: Helium 1 day, ungoogled-chromium-macos and Thorium one major.

**Rejected.**

- Building our own Chromium up front — the cost is certain and the gain unmeasured.

## D8

**Page scripts never observe our code. The daemon enforces it for every client: the `Runtime`, `Console` and
`Debugger` domains are never enabled in the browser (the daemon answers a client's enable itself), every evaluation
and init script runs in an isolated world, no binding or global is created in the main world, and the brand override
reaches every worker and service worker.** (2026-11-15, owner required hiding `Runtime.enable` with no traces and
robust to change; the class-wide rule is the design agent's proposal, owner agreed)

**Why.** Hiding one leak at a time leaves the others: main-world execution, main-world init scripts, bindings and
worker inconsistency are each tested by public detectors. A rule the daemon enforces cannot be broken by a new
agent-browser version or a helper, and a new way to detect an enabled domain finds nothing, because the domain is
never on. It extends the daemon's existing allow-list (`packages/daemon/src/browser/checkCdpRequest.ts`).

> **Checked 2026-11-15:** agent-browser v0.43.0 (commit 1cc19526) consumes only `Runtime.consoleAPICalled`
> (`console` command, `cli/src/native/actions.rs:1981`) and `Runtime.exceptionThrown` (`errors`, `actions.rs:1999`);
> no execution-context events; evaluation uses the default main-world context; init scripts (`network.rs:175`, the
> React hook) run in the main world. `Runtime.evaluate` and `callFunctionOn` work without `Runtime.enable` ("If the
> parameter is omitted the evaluation will be performed in the context of the inspected page", js_protocol.json).

> **Checked 2026-11-15:** V8 commits 61a907540d and e08e973474 (May 2025) stopped user getters running during
> previews, yet rebrowser bot-detector still detects `Runtime.enable` through `prepareStackTrace` calls and extra
> `error.name` reads (`index.js:21-25`), and tests `mainWorldExecution`, `sourceUrlLeak`, `workerConsistency`,
> `cdpBindingGlobals` — [bot-detector](https://bot-detector.rebrowser.net). Patchright runs all evaluation in
> per-frame isolated worlds (`driver_patches/framesPatch.ts:272`) and drops console support.

> **Checked 2026-11-15:** `Emulation.setUserAgentOverride` is per target; workers and service workers need their
> own (Playwright `crPage.ts:823-828`); `--user-agent` leaves Sec-CH-UA brands unchanged
> (`components/embedder_support/user_agent_utils.cc`).

**Consequences.** The agent loses agent-browser's `console`, `errors` and `expose`, and cannot read the page's JS
globals (isolated worlds share the DOM, not globals). Site helpers work through the DOM; calling a site's internal API
with its own client code (X's per-request header) is out.

**Rejected.**

- Hiding only `Runtime.enable` — main-world execution, init scripts, bindings and workers still leak.
- Emulating context events for clients (rebrowser's approach) — agent-browser consumes none, so dropping the enable
  suffices.
- A narrow main-world exception for site helpers — it is a trace; the owner chose none.
- Patching agent-browser instead of the daemon — covers one client; the rule must hold for all ([D4](#d4)).

## D9

**The eval is a script that drives the browser by the agent's own path (daemon tunnel and agent-browser) on a
residential machine, never CI, and writes a result file per run for comparison: a reCAPTCHA v3 score from our own key
on a public test page, the verdicts of the leak test pages, and Allegro searches until a CAPTCHA.** (2026-11-15,
owner asked for a reCAPTCHA measurement; shape is the design agent's proposal, owner agreed)

**Why.** A datacenter IP would dominate every result; a different driving path would measure a different browser.
The test page must be public, because the daemon's proxy refuses loopback (`buildChromiumArgs.ts`,
`--proxy-bypass-list=<-loopback>`).

> **Checked 2026-11-15:** new reCAPTCHA keys are created only in Google Cloud projects; 10,000 assessments a month
> free; without billing only four score levels (0.1, 0.3, 0.7, 0.9) and `LOW_CONFIDENCE_SCORE` on little traffic;
> "Scores in a staging environment and within 7 days of implementation might differ" —
> [FAQ](https://docs.cloud.google.com/recaptcha/docs/faq). Billing: owner chose to enable it for finer
> scores (still free within the quota).

> **Checked 2026-11-15:** Google Cloud project `poweragents-stealth-eval` on the owner's personal account, separate
> from `poweragents-desktop` (the app's Google sign-in); `recaptchaenterprise.googleapis.com` enabled without billing;
> score-based web key `6LeHciEuAAAAAJSL9I_rLsgkmxdwe5IL27QfR_dv` (site keys are public), allowed domain
> `kedrzu.github.io`. No billing account exists on that Google account yet.

> **Checked 2026-11-15:** the probe page is live at
> [kedrzu.github.io/stealth-eval-page](https://kedrzu.github.io/stealth-eval-page/) (public repo
> `kedrzu/stealth-eval-page`); it writes the token into `#token`, readable from an isolated world. End to end: a
> token from a Playwright-driven headed Chrome (Playwright MCP, residential IP), assessed with `createAssessment`,
> scored 0.9 with no reasons — one run, no billing (four levels), so not conclusive; reCAPTCHA alone may not separate
> automated from human here, which is why it is one reading among the panel ([D6](#d6)).

**Rejected.**

- Running the eval in CI — datacenter IP.
- Google's public reCAPTCHA demo page as the only score — not under our control; kept as a second reading.

## D10

**This design covers only the general stealth mechanism and its eval. Ready-made commands for popular sites (site
helpers) are deferred to a design of their own, and how the agent posts on X (official API or browser) is not this
design's question.** (2026-11-15, owner)

**Why.** The owner wants the general mechanism first; whether X writes go through the API is a product question about
X, not about stealth.

**Consequences.** A later site-helper design inherits [D8](#d8): helpers work through the page, not the site's own
client code.

**Rejected.**

- Site helpers in this design — deferred by the owner.
- X writes through the official API as part of ban protection — out of scope; earlier proposal in
  [history/JOURNAL.md](history/JOURNAL.md).
