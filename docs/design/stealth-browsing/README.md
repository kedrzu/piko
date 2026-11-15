# Stealth browsing and site helpers

poweragents gives a person an AI agent with its own browser. This design is about two things that browser needs to
be useful on the real web. First, sites must not be able to tell that an agent is driving it. Second, later on, the
agent gets ready-made commands for popular sites ("read my X timeline", "reply to this post"), so it does not have to
work every page out from scratch.

## Why

Many sites block AI agents. Allegro lets an agent run a handful of searches, then shows a CAPTCHA, and the task stops
there. X goes further: its rules name scripting the website as grounds for permanently suspending the account. Its
own agent access goes through a paid API. The person cannot pick only friendly sites, because the agent works
wherever their errands take it.

So there are two costs, and the owner ranks them. The worse one is **the person losing their account**: a ban
lands on their real identity and cannot be undone. The second is **the agent not finishing**: an errand that stops at
a CAPTCHA wastes the person's time and their trust in the product.

## What is different once it exists

The person asks the agent to compare prices for a coffee grinder across Allegro and a few shops. The agent works
through the searches at roughly the pace a person would and is not stopped. If a site does show a CAPTCHA anyway, the
agent slows down rather than pressing on. Only if that fails does it ask the person to step in, which happens rarely.
Nothing the agent does on the person's X account looks like a script, and the risky actions there take the safest
route available.

The team has a number for all this: how often the agent gets through a fixed set of well-protected sites. Every
change to the browser either moves that number or is dropped.

## Who this protects, and what that rules out

Tools built to avoid bot detection mostly serve scraping: they make a thousand requests look like a thousand
different people by rotating fingerprints, proxies and profiles. Our case is the opposite: one real person, on their
own accounts, at a human scale ([the goals and their order](DECISIONS.md#d1)). For a logged-in account a fingerprint
that changes from day to day is itself suspicious.

So stealth here means **looking like the same ordinary browser every day**. The browser shows the person's real
machine as it is: their screen, fonts, graphics card. It removes only the signs of being automated
([why nothing is spoofed](DECISIONS.md#d2)). One stealth browser that failed on Allegro shows why this matters: it
pretended to be Windows, and the real Linux fonts underneath gave it away.

We start from a better position than a scraper:

- **The person's home IP.** Sites weigh IP reputation heavily, and a home connection has a good one.
- **A persistent profile with real logins.**
- **A real Chromium.** Its network fingerprint is genuine, so there is nothing to fake there.

## Which browser

The agent's browser stays the one it has now. That is a Chrome for Testing build which the daemon downloads and
drives over a private connection that no other program on the computer can use
([why this browser](DECISIONS.md#d3)). We looked hard at replacing it, and every alternative failed on something we
could name:

- **Ready-made stealth browsers.** CloakBrowser is a closed binary that we may not redistribute. Camoufox is a Firefox,
  and Firefox no longer speaks the protocol our agent tooling and security checks run on.
- **Browsers built for agents.** Ardia and Yab are macOS-only. Their agent features are the command-line control we
  already have.
- **Native web views.** They would mean a separate engine and a separate control stack on macOS and on Windows.
- **Building our own patched Chromium.** That is not a one-off job. Chrome releases every two weeks and ships security
  fixes weekly. Each release means rebuilding on large machines, for two platforms, and signing the result. A browser
  holding someone's logins that falls behind on security fixes is worse than one that gets detected. We build our
  own only if measurement shows a leak nothing else can fix, and then we start from an existing project's patches
  ([when we would build our own](DECISIONS.md#d7)).

Today this browser gives itself away in three known ways:

- **It announces that it is being automated.** It does so because of how the daemon connects to it, but one launch
  flag turns that off and keeps the private connection.
- **It names itself "Chromium" rather than "Google Chrome".**
- **Its input does not look human.** Its clicks jump straight to the centre of a button, and its typing arrives
  without key presses.

## Where the hiding happens

Every command the agent sends to the browser already passes through the daemon, which uses that position to keep the
agent inside its limits. Stealth goes there too ([layers in the daemon](DECISIONS.md#d4)), in three layers:

- **What a page's scripts can see.** Launch flags, the browser's name, and any trace of remote control the
  measurement turns up.
- **How input arrives.** A click from the agent becomes a mouse movement along a curve, and text becomes key presses
  at a typing pace.
- **How fast the agent goes.** The daemon holds every site to a human pace. When a page shows a CAPTCHA it slows down
  further, and it tells the agent it is waiting, so the agent does not decide the browser is broken
  ([why pace is enforced, not suggested](DECISIONS.md#d5)). A burst of thirty searches in two minutes gets blocked
  however perfect the fingerprint is.

Because all of this happens in the daemon, anything that drives the browser gets it without extra work: the agent's
current tool, and later the site helpers, whatever language they are written in.

## How we know it works

We measure on a fixed set of real, well-protected sites, one or more behind each major protection vendor. Allegro
is one of them, and we count CAPTCHAs and how many actions pass before a block. Public fingerprint test pages give a
quick check for individual leaks ([the eval](DECISIONS.md#d6)).

A ban cannot be measured: it comes late, it hits a whole account, and nobody tests it on a real one. So protection
against bans comes from rules instead: the pace limits, and sending the actions that get accounts banned along the
safest route available.

## Scope, and what comes first

In scope: the browser's stealth layers, the eval, and site helpers for popular sites.

**First step:** measure the browser as it is today against the eval sites. That shows which leaks actually reach the
sites, and how many Allegro searches pass before a CAPTCHA. The result sets the order of the layers and settles
whether we will ever need our own Chromium build.

Still open:

- **Site helpers, not yet designed.** These are the scripted commands for popular sites. Open questions: whether they
  click through the page or call the site's own internal API from inside its tab, how they reach the browser, and who
  keeps them working when sites change.
- **X writes through the official API.** Posting and replying through X's paid API is the one route with no ban risk.
  It costs $0.015 per post, but needs the person's own developer account. Parked by the owner as secondary.
- **Hiding remote control from page scripts.** agent-browser asks the browser for a feature that page scripts can
  detect, and needs that feature to run scripts. Reports say Chrome 137 made the leak harder to detect; the
  measurement decides whether we must hide it.
- **Pace values and back-off rules**, and how the agent is told it is being paced.
