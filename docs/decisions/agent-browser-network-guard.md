# The agent's browser reaches only public addresses, through a proxy in the daemon

## Status

Accepted

## Context

D8: the agent sees nothing of the computer or its networks, and the sandbox firewall closes every private address to
it. D27 runs the agent's browser on the host instead, outside that firewall. Anything the agent opens in the browser —
by navigation or by a page's own `fetch` or WebSocket — would otherwise reach the host's loopback services (the
daemon's own API, anything else listening locally), the router and every device on the local network.

> **Checked 2026-11-14 (plan review):** a scheme check on navigation methods does not cover in-page requests, and a
> host-name rule does not cover IP literals or names resolving to private addresses.

## Options Considered

- **Accept the exposure:** amend D8 so the browser sees the local network. Trade-off: no work, but the sandbox's
  network isolation stops at the browser.
- **Block private IP literals in navigation only:** cheap. Trade-off: misses in-page requests and names that resolve
  to private addresses.
- **An HTTP proxy in the daemon:** Chrome sends everything through it (`--proxy-server`, `--proxy-bypass-list=<-loopback>`,
  `--disable-quic`, WebRTC only through the proxy). It refuses loopback, private, CGNAT, link-local and unique-local
  destinations after DNS resolution and connects to the address it checked. Trade-off: a new piece of infrastructure
  in the daemon.

## Decision

The proxy (`BrowserNetworkGuard`), chosen by the owner on 2026-11-14 to keep D8 whole.

## Consequences

The agent's browser reaches the public internet only. A person who wants the agent to use a local service cannot do
it through the browser. Every browser request costs one extra local hop.
