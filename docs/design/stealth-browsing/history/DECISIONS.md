# Retired decisions

Full text of decisions that no longer hold, under their original IDs, oldest form first.

## D4

Retired 2026-11-15, partly replaced: the "CDP leaks the measurement shows" part became a guarantee independent of
measurement, [D8](../DECISIONS.md#d8); the rest holds in [D4](../DECISIONS.md#d4).

**Stealth is built in the daemon, in layers every browser client gets: the JS environment (launch flags, the "Google
Chrome" brand set over CDP at browser level, CDP leaks the measurement shows), input (mouse paths and per-key typing
generated from the agent's clicks and text), and pace ([D5](#d5)).** (2026-11-15, design agent proposal, owner agreed)

**Why.** Every CDP command already passes the daemon's multiplexer, so a fix there covers agent-browser, site helpers
in any language, and anything later. Vendors document client-side JS fingerprinting first and behaviour second (HUMAN:
"user-interaction anomalies within mouse clicks, screen touches, cadence and timing" —
[docs](https://docs.humansecurity.com/applications/bd-detection-overview)).

> **Checked 2026-11-15:** agent-browser v0.43.0 sends `Runtime.enable` on every page
> (`cli/src/native/browser.rs:1040`); a click is one `mouseMoved` plus press and release at the element centre
> (`cli/src/native/interaction.rs:59-94`); `type` sends `Input.insertText` per character, key events only for
> Enter/Tab — [agent-browser](https://github.com/vercel-labs/agent-browser).

**Rejected.**

- Stealth inside each client (Patchright, rebrowser-patches, ghost-cursor per helper) — every client and every
  language would need its own copy; the daemon sees all traffic once.
- In-page JS patches (puppeteer-extra-plugin-stealth style) — detectable themselves; that plugin is abandoned since
  2023 and named as detected in DataDome's docs.

Retired 2026-11-15, partly replaced: the input layer and the brand override became conditional on measurement; the
rest holds in [D4](../DECISIONS.md#d4).

**Stealth is built in the daemon, in layers every browser client gets: the JS environment (launch flags, the "Google
Chrome" brand set over CDP on every target, and the guarantee that page scripts never observe our code, [D8](#d8)), input (mouse paths and per-key typing
generated from the agent's clicks and text), and pace ([D5](#d5)).** (2026-11-15, design agent proposal, owner agreed)

**Why.** Every CDP command already passes the daemon's multiplexer, so a fix there covers agent-browser, site helpers
in any language, and anything later. Vendors document client-side JS fingerprinting first and behaviour second (HUMAN:
"user-interaction anomalies within mouse clicks, screen touches, cadence and timing" —
[docs](https://docs.humansecurity.com/applications/bd-detection-overview)).

> **Checked 2026-11-15:** agent-browser v0.43.0 sends `Runtime.enable` on every page
> (`cli/src/native/browser.rs:1040`); a click is one `mouseMoved` plus press and release at the element centre
> (`cli/src/native/interaction.rs:59-94`); `type` sends `Input.insertText` per character, key events only for
> Enter/Tab — [agent-browser](https://github.com/vercel-labs/agent-browser).

**Rejected.**

- Fixing only the CDP leaks the measurement shows — the owner wants no traces regardless of measurement
  ([history](history/DECISIONS.md#d4)).
- Stealth inside each client (Patchright, rebrowser-patches, ghost-cursor per helper) — every client and every
  language would need its own copy; the daemon sees all traffic once.
- In-page JS patches (puppeteer-extra-plugin-stealth style) — detectable themselves; that plugin is abandoned since
  2023 and named as detected in DataDome's docs.

## D11

Retired 2026-11-15, partly replaced: the page now assesses each token itself and keeps the score; the rest holds in
[D11](../DECISIONS.md#d11).

**The reCAPTCHA probe is a small static multi-page shop on GitHub Pages, no backend: a product list with search,
filters and pagination; a product page with a long description, tabs, a gallery and expandable sections; an order or
contact form (text, select, checkbox, date, validation, submit); and a cookie-consent modal. At every meaningful action
the page requests a token named after that action and appends it to a list in the DOM. It also records how input
arrived — mouse movements before each click, whether text came as key events, the timing between them — into the
DOM. Scenarios ("search, open two products, read a description, submit the form") live in the eval in this repo, and
the agent, the headless control and the person run the same ones.** (2026-11-15, owner asked for content that
reproduces reading, submits and component interactions; shape and input recording are the design agent's proposal,
owner agreed)

**Why.** reCAPTCHA v3 scores actions within a visit, not a single page load, so a page with content measures a
whole visit. Several pages, because moving between pages is the core of what the agent does (search, list, product on
Allegro). Input recording does not show whether sites react; it shows exactly how the agent's input differs from the
person's, which informs whether to build the input layer ([D4](#d4)) and then checks it.

**Rejected.**

- A single page with components — measures clicking, not navigation.
- The current one-page probe (a text field and a button, `kedrzu/stealth-eval-page`) — no visit to score; it is
  replaced by the shop.
- Scenarios kept on the page — the eval owns them, so the agent and both controls run identical steps.

## D5

Retired 2026-11-16, partly replaced: the values, the recognition of a block and how the agent is told were settled
from the Allegro measurement; the rest holds in [D5](../DECISIONS.md#d5). The owner first asked for a slightly lower
threshold than 8 seconds to be measured; 5 seconds passed and became the pace.

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
