# Stealth browsing

poweragents gives a person an AI agent with its own browser. This design is about making that browser usable on the
real web: sites must not be able to tell that an agent, not the person, is driving it. It is a general mechanism, for
every site the agent visits.

## Why

Many sites block AI agents. Allegro lets an agent run a handful of searches, then shows a CAPTCHA, and the task stops
there. X goes further: its rules name scripting the website as grounds for permanently suspending the account. The
person cannot pick only friendly sites, because the agent works
wherever their errands take it.

So there are two costs, and the owner ranks them. The worse one is **the person losing their account**: a ban
lands on their real identity and cannot be undone. The second is **the agent not finishing**: an errand that stops at
a CAPTCHA wastes the person's time and their trust in the product.

## What is different once it exists

The person asks the agent to compare prices for a coffee grinder across Allegro and a few shops. The agent works
through the searches at roughly the pace a person would and is not stopped. If a site does show a CAPTCHA anyway, the
agent slows down rather than pressing on. Only if that fails does it ask the person to step in, which happens rarely.
Nothing the agent does on the person's X account looks like a script.

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

- **What a page's scripts can see.** A launch flag, no trace of remote control (more on this below), and the name
  "Google Chrome" everywhere a page or its background workers can read it.
- **How input arrives.** A click from the agent becomes a mouse movement along a curve, and text becomes key presses
  at a typing pace. This one waits for evidence: it is built only once the measurement shows sites reacting to how
  input arrives.
- **How fast the agent goes.** The daemon holds every site to a human pace: one page load every five seconds, whatever
  the number of conversations. It notices a CAPTCHA or block from what the page already reports, without touching it,
  and then pauses that site and slows down for an hour; a second block makes the agent ask the person. A short wait is
  just a slower command; a longer one comes back as a message saying why and for how long, so the agent does not decide
  the browser is broken ([why pace is enforced, not suggested](DECISIONS.md#d5)).

Because all of this happens in the daemon, anything that drives the browser gets it without extra work: the agent's
current tool, and anything that drives the browser later, whatever language it is written in.

### Page scripts never see our code

Hiding traces of remote control one at a time would never end: each fix leaves the next one for a detector to find.
So the daemon enforces one rule for everyone instead: **nothing a page's own scripts can observe ever comes from us**
([the rule and what it costs](DECISIONS.md#d8)).

Chrome's debugging protocol has switches that send page events back to the controller, and switching them on
changes small things a page can measure. The daemon never switches them on; when a client asks, the daemon answers
"done" itself. Any code the agent runs goes into an isolated copy of the page's scripting environment: it sees the
same page, but the page's scripts cannot see it. And the browser's disguised name reaches the page's background
workers too, not only the page itself, because detectors compare the two.

A new version of the agent's tool, or a program written next year, cannot break this, since the daemon enforces it
rather than the client. A newly discovered way to detect one of those switches finds nothing, since none is ever on.

The price is that the agent can no longer read the page's console, its errors, or the page's own script variables.
It still sees and works with everything on the page.

## How we know it works

We measure on a fixed set of real, well-protected sites, one or more behind each major protection vendor. Allegro
is one of them, and we count CAPTCHAs and how many actions pass before a block. Public fingerprint test pages give a
quick check for individual leaks ([the eval](DECISIONS.md#d6)).

On top of that sits a score from reCAPTCHA v3, Google's invisible bot check, from a key of our own on a public test
page. The eval drives the browser exactly the way the agent does. It runs on a real computer with a home connection,
because a server's IP would swamp every result ([how the eval runs](DECISIONS.md#d9)).

A fresh key on a quiet page needs days and traffic before Google's scores settle. So every run also scores two
controls on our key: a plain headless Chrome, which is plainly a bot, and the person browsing by hand. The reCAPTCHA
reading counts only once it tells those two apart. Google's public demo page is no shortcut: it is over its free quota
and answers 0.9 to everyone.

The test page itself is a small made-up shop rather than a bare button, because reCAPTCHA scores what a visitor does
during a visit: searching, filtering, paging, reading a long product description, opening tabs, dismissing a cookie
banner, filling in and submitting a form. Each such action gets its own score. The page also records how input
arrived (mouse movement before a click, real key presses or pasted text), which shows exactly how the agent differs
from a person ([the test shop](DECISIONS.md#d11)). The same scripted visit is run by the agent, by the plain
headless Chrome and by the person.

A ban cannot be measured: it comes late, it hits a whole account, and nobody tests it on a real one. So protection
against bans comes from rules instead, chiefly the pace limits.

## Scope

The design was closed on 2026-11-15 and is ready to be built.

In scope: the browser's stealth layers and the eval. Out of scope: ready-made commands for popular sites, which get a
design of their own later, and how the agent posts on X ([what this design leaves out](DECISIONS.md#d10)).

The eval's first measurement of the browser as it is today is what the pace values come from, and its numbers decide
whether human-like input and the browser's name are built, in which order, and whether we will ever need our own
Chromium build.
