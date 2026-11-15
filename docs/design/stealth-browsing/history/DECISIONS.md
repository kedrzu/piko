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
