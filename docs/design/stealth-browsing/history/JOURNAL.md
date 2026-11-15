# Journal

## 2026-11-15

- Owner's brief: many sites block AI agents (Allegro, X); X's agent access is paid. Build, first, a way for the
  agent's browser to avoid bot detection (stealth, human-like input), measured by an eval (owner said "recept H" —
  read as reCAPTCHA v3 score, unconfirmed). Second, a maintained library of site helpers (e.g. X: read timeline,
  reply) exposed to the agent as simple commands; language irrelevant. Today the agent uses agent-browser, not
  Playwright, for token cost.
- Design agent proposal (not agreed): stealth means one stable, ordinary-looking browser for one person's own
  accounts, not identity rotation; fix leaks and humanize input in the daemon's CDP multiplexer so every client gets
  it; patch the browser binary only if measurement shows a leak CDP rewriting cannot fix. Asked owner to confirm scope
  (own accounts, human scale) and the eval.
- Correction to the first turn: `--remote-debugging-pipe` alone sets `navigator.webdriver = true`; CfT does have
  proprietary codecs, but lacks the "Google Chrome" brand.

> **Checked 2026-11-15 (research subagent, primary sources unless noted):**
>
> - agent-browser v0.43.0 is raw CDP in Rust; sends `Runtime.enable` on every page (`cli/src/native/browser.rs:1040`);
>   click = one `mouseMoved` + press/release at element centre, no path (`cli/src/native/interaction.rs:59-94`);
>   `type` = `Input.insertText` per character, key events only for Enter/Tab; `fill` sets value by JS —
>   [repo](https://github.com/vercel-labs/agent-browser).
> - `--remote-debugging-pipe` enables `AutomationControlled` → `navigator.webdriver` true —
>   [runtime_features.cc](https://github.com/chromium/chromium/blob/main/content/child/runtime_features.cc)
>   (`{wrf::EnableAutomationControlled, switches::kRemoteDebuggingPipe, true}`); reproduced on CfT 158 headed macOS.
> - CfT: proprietary codecs present ("enables proprietary media codecs (e.g., H.264, AAC, MP3)"); brands are only
>   `Not.A/Brand` + `Chromium` (no "Google Chrome"); non-removable "Chrome for Testing" banner —
>   [CfT README](https://github.com/chromium/chromium/blob/main/docs/chrome_for_testing/README.md). Widevine unsettled.
> - allegro.pl is behind DataDome: `set-cookie: datadome=…` on `curl -I`; vendor case study
>   [datadome.co](https://datadome.co/customers-stories/from-awareness-to-resilience-allegros-journey-with-datadome-against-bots/);
>   CloakBrowser #471 (2026) reports DataDome tightened on Allegro and weighs IP reputation.
> - X API is pay-per-use, no subscriptions: post read $0.005, post create $0.015 —
>   [pricing](https://docs.x.com/x-api/getting-started/pricing.md). Hosted MCP at `https://api.x.com/mcp`, billed
>   through the API (billing not verified) — [MCP](https://docs.x.com/tools/mcp.md).
> - X ToS forbids access "by any means (automated or otherwise) other than through our currently available, published
>   interfaces". Automation rules (primary page 403, quoted by a secondary source): "Use non-API-based forms of
>   automation, such as scripting the X website … may result in the permanent suspension of your account."
> - `x-client-transaction-id`: per-request anti-scraping header computed in the page; some GraphQL ops 404 without it
>   ([udp.re](https://udp.re/blog/x-client-transaction-id), secondary). UI-driven automation gets it for free.
> - Tools: rebrowser-patches and patchright (automation-library patches, active); Camoufox (patched Firefox, active);
>   ghost-cursor (Bezier mouse, active); puppeteer-extra-plugin-stealth abandoned since 2023 and named in DataDome's
>   docs as detected; undetected-chromedriver dormant since 2025-07.
> - Live eval pages: recaptcha-demo.appspot.com/recaptcha-v3-request-scores.php,
>   antcpt.com/eng/information/demo-form/recaptcha-3-test-score.html, CreepJS, bot.sannysoft.com, BotD playground,
>   browserscan.net/bot-detection, demo.turnstile.workers.dev, bot-detector.rebrowser.net,
>   deviceandbrowserinfo.com/are_you_a_bot. No public DataDome test page found; Allegro itself is the test.

- Owner: two goals, in this order of concern: (1) the person's account must not get banned; (2) the agent must be
  able to finish its task — today agentic browsing (e.g. many Allegro searches) trips a CAPTCHA after some number of
  actions and the task stops. Still unanswered: the eval ("recept H"), and API-for-writes on X.
- Design agent: the CAPTCHA-after-N-actions case is driven by pace and volume, not only fingerprint, so the design
  needs a per-site pace element besides leak fixes and input humanization. Ban risk is not directly measurable
  (delayed, account-level), so it is handled by policy; CAPTCHA rate is measurable on the real site. Proposed:
  pacing enforced by the daemon, with the agent told it is paced. Not agreed yet.
- Owner: not only Allegro and X — the person may use any site, with any protection, so stealth must be as strong as
  possible in general; switching the browser is acceptable. The X developer account question is secondary (parked).
- Design agent proposal (not agreed): stay on Chromium over CDP and fix in layers (launch flags, UA metadata via CDP,
  input humanization, generic pacing with back-off on a CAPTCHA), measured by a panel of sites covering the major
  vendors; a patched or different browser only if the panel shows a leak these layers cannot fix. Argument: spoofing
  engines hide many identities; one real person on a real machine is most consistent with their real fingerprint.

> **Checked 2026-11-15 (research subagent):**
>
> - `--disable-blink-features=AutomationControlled` restores `navigator.webdriver = false` under
>   `--remote-debugging-pipe` (local test, CfT 158 headed macOS; disable pass runs after the enable pass in
>   [runtime_features.cc](https://chromium.googlesource.com/chromium/src/+/main/content/child/runtime_features.cc)).
>   The pipe and its security reason stay.
> - CloakBrowser: closed-source patched Chromium (on ungoogled-chromium), license key per launch, "no redistribution
>   (OEM/SaaS license required to serve third parties)" — [repo](https://github.com/CloakHQ/CloakBrowser),
>   [binary license](https://github.com/CloakHQ/cloakbrowser/blob/main/BINARY-LICENSE.md); patch claims
>   self-reported; ~monthly builds on Chromium 156 (CfT is at 158). Its Allegro block #16 was Linux fonts leaking
>   through a spoofed Windows persona; #471 maintainer: "the main way it shows up is IP reputation".
> - Camoufox: patched Firefox, MPL-2.0, driven by Playwright over Juggler, not CDP —
>   [camoufox.com](https://camoufox.com/stealth/); site admits a year-long maintenance gap. Firefox removed CDP as of
>   141 — [fxdx.dev](https://fxdx.dev/cdp-retirement-in-firefox/). agent-browser supports chrome and lightpanda only;
>   Firefox via WebDriver BiDi is in open PR [#2205](https://github.com/vercel-labs/agent-browser/pull/2205).
> - Google Chrome may not be redistributed without Google's written permission (ToS 9.2, 2018 archive). Chrome 136+
>   ignores remote debugging on the default profile; a separate `--user-data-dir` works —
>   [Chrome blog](https://developer.chrome.com/blog/remote-debugging-port).
> - Vendors (Cloudflare, Akamai, HUMAN, Kasada docs) document client-side JS fingerprinting first, behaviour second
>   (HUMAN: "user-interaction anomalies within mouse clicks, screen touches, cadence and timing"); none ranks vectors.
>   `Runtime.enable` detection reportedly weakened by V8 changes in Chrome 137 —
>   [crawlex](https://blog.crawlex.net/blog/detecting-cdp-runtime-enable/) (third-party, unverified).

- Owner: asked whether an agent-oriented open-source browser (named Ardia, Helium, Zen, yab) or a native web view
  would be better than our Chromium, provided it covers macOS and Windows; and how much work embedding our own
  Chromium or a native web view is.
- Design agent: none of the four is agent-native, cross-platform and bundleable at once; their agent layer is what we
  already have (Ardia drives itself with agent-browser). Web views split the stack per platform (WKWebView has no
  CDP). We already ship a Chromium (CfT pinned at current stable 157.0.8103.78,
  `packages/daemon/src/browser/chromiumRelease.ts:20`); the expensive step is building a modified one. Recommendation
  unchanged: CfT plus layers, own build only if measurement shows a leak below CDP. Awaiting owner.

> **Checked 2026-11-15 (research subagent):**
>
> - Ardia: Helium-based Chromium 157, GPL-3.0 as distributed, macOS Apple Silicon only; "runs agent-browser's commands
>   on the Ardia the user has open" — [repo](https://github.com/ardia-browser/ardia).
> - Helium: ungoogled-chromium fork, GPL-3.0, macOS + Windows, privacy browser, not agent-oriented, one day behind
>   Chrome stable (0.21.3, 2026-11-12) — [repo](https://github.com/imputnet/helium).
> - Zen: Firefox 160 based, MPL-2.0, no agent features; Firefox control is Marionette / WebDriver BiDi only —
>   [repo](https://github.com/zen-browser/desktop).
> - Yab: closed-source WebKit browser, macOS 15.4+ only, CLI + MCP, no CDP — "Yab itself is free and closed source"
>   ([yab-mcp](https://github.com/yetanotherbrowser/yab-mcp)).
> - Agent engines: Obscura (Rust+V8, headless only, no persistent profiles) and Lightpanda (Zig, no rendering,
>   AGPL-3.0, no Windows) — Lightpanda loaded 5/9 protected pages vs Chrome 7/9 on the same residential proxies
>   (Decodo test, third-party).
> - WKWebView: no CDP, only Safari Web Inspector when `isInspectable` is set
>   ([webkit.org](https://webkit.org/blog/13936/enabling-the-inspection-of-web-content-in-apps/)); default UA lacks
>   Safari's `Version/… Safari/…` tokens (WebKit bug 278284).
> - WebView2: CDP via `CallDevToolsProtocolMethod`
>   ([Learn](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/chromium-devtools-protocol)); default UA
>   is Edge's; Evergreen runtime follows Edge stable.
> - CEF: prebuilt BSD-3 builds one major behind stable (156 on 2026-11-13); reports only the Chromium brand
>   ([cef#3596](https://github.com/chromiumembedded/cef/issues/3596), older).
> - Own Chromium build: 100 GB+ disk, 16 GB+ RAM, "20+ [cores] is not excessive"
>   ([Windows build docs](https://chromium.googlesource.com/chromium/src/+/main/docs/windows_build_instructions.md));
>   ~1 h per build on 16 cores (third-party blog); a milestone every two weeks since Chrome 153
>   ([Chrome blog](https://developer.chrome.com/blog/chrome-two-week-release)) plus weekly security refreshes.
>   Small forks lag 1 day (Helium) to one major (ungoogled-chromium-macos, Thorium).

- Owner: "Ok" to the recommendation. Recorded D1–D7 (goals and scope, consistency over spoofing, stay on CfT with the
  AutomationControlled flag, layers in the daemon, daemon-enforced pace, eval panel, own build only on evidence).
  README written from them. Next proposed step: baseline measurement of today's browser on the eval panel. Site
  helpers not yet discussed.
