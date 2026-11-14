# ChatGPT sign-in through a callback relay in the daemon

## Status

Accepted

## Context

The agent runs in OpenCode inside the sandbox's container, so the ChatGPT sign-in has to happen there: OpenCode keeps
the tokens and runs the agent on them. The sandbox is closed on purpose — Lima forwards only the agent's port to the
computer, and the container publishes only OpenCode's port (`buildLimaConfig.ts`, `buildAgentRunArgs.ts`).

> **Checked 2026-11-14:** OpenCode 2.2.7's `openai` integration offers three OAuth methods — `chatgpt-token-sharing`
> ("Sign in with ChatGPT"), `chatgpt-browser` (Codex browser, legacy) and `chatgpt-headless` (device code, legacy).
> The first two end by redirecting the browser to `http://127.0.0.1:<port>/auth/callback`, which only OpenCode inside
> the container listens on: a random port per attempt for token sharing, 1455 for the Codex browser flow.

> **Checked 2026-11-14:** device code sign-in needs the switch "Enable device code sign-in for Codex…" in ChatGPT's
> security settings, off by default and set only by an admin on workspace accounts —
> [ChatGPT Learn, Authentication](https://learn.chatgpt.com/docs/auth).

> **Checked 2026-11-14:** a token from "Sign in with ChatGPT" carries only `sub` and encrypted metadata; OIDC `userinfo`
> returns only `sub`. The app cannot know the account's email or plan.

## Options Considered

- **Device code.** No networking change. Trade-off: the person must first find and turn on a security switch in
  ChatGPT (an admin, on a workspace account) and type a code; OpenCode marks the method legacy.
- **Forward the callback port through Lima.** Trade-off: token sharing picks a random port per attempt, which a
  container's published ports cannot follow, and a fixed forward (1455) would open the sandbox to the computer for good.
- **A relay in the daemon.** For one sign-in, the daemon listens on the computer's `127.0.0.1` at the port of the
  attempt's `redirect_uri`, accepts only `GET /auth/callback` with the attempt's `state`, passes it into the container
  (`curl` through `sandbox.exec`, the URL on stdin so the code never reaches a process's arguments) and returns
  OpenCode's page to the browser. Trade-off: the daemon briefly owns a port on the computer, and a port already taken
  fails the start (a new attempt picks a new port).

## Decision

The relay with "Sign in with ChatGPT" (owner, 2026-11-14): the person only signs in on OpenAI's page and the app
confirms by itself, as with any desktop app, and the sandbox stays closed outside the minutes of a sign-in. ChatGPT has
no plan check: an account whose plan does not allow the agent learns it from the provider's error in the conversation
(owner, 2026-11-14).

## Consequences

- `ChatgptSignInService` and `startLoginCallbackRelay` in the daemon; the relay closes after the callback, on cancel,
  on expiry and on a new start.
- The provider of the last completed sign-in is kept in `ai-provider.json` beside the agent's password and decides the
  provider of new conversations.
- If OpenCode drops token sharing or changes its callback, the relay follows `redirect_uri` from the attempt, so only a
  change of scheme or host breaks it.
