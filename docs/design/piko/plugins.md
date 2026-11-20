# Plugins

A plugin is how the agent gains a capability it doesn't ship with: reading the person's mail, sorting it every morning,
modelling in Blender. People install capabilities, not tools — "email sorting", not "a Gmail server" — and most of them
will never build a plugin by hand. What the agent builds for them when asked for something new is not a plugin: it
stays in the project where it was asked for.

## What a plugin is made of

There is one kind of plugin, made of whatever parts it needs: instructions for the agent (skills), tools, a setup
conversation that runs right after installing it, and programs added to the agent's environment. "Workflows",
"creative", "for work" are only tags for browsing the marketplace ([why one kind](DECISIONS.md#d17)).

Three plugins show the range. **Gmail** gives the agent the person's mail: tools that read it and create drafts but never
send, a short skill on how to use them, and a Google sign-in. **Email sorting** is a workflow: it lives in a project
such as "Poczta", where it keeps the sorting rules it learns, carries the skill that sorts and a setup conversation, and
needs a mail plugin to work with — Gmail or Outlook. **Blender** adds the program to the environment and a skill for
driving it from scripts.

On disk a plugin is a folder: a `plugin.json` describing it, its skills, and the code of its tools. `plugin.json` holds
only what the app itself acts on: its marketplace text in every app language, tags, whether it belongs to the profile
or to a project, which skill is its setup conversation, and what it adds to the environment, at fixed versions.
Everything else — which projects it sets up, where it keeps what it learns, which plugins it works with — is written in
its setup skill, and the agent does it with the tools it always has ([the plugin's folder](DECISIONS.md#d39)).

## Tools cost context, so they are programs first

Every tool the agent can see takes up room in what the model reads on every turn. MCP servers, the standard way to give
an agent tools, are expensive here: a browser task measured at 31–46 thousand tokens through MCP took 4–7 thousand
through a command-line program with a short instruction, with equal results. So a plugin's tools are, by default, a
small command-line program of ours with a skill telling the agent how to call it; MCP servers still work, and the first
Gmail plugin uses one because a good server already exists ([why programs first](DECISIONS.md#d37)).

A program sits in the environment and works from any project, but the agent only knows about it from its skill. That
gives projects their focus cheaply: a project lists the skills of the plugins attached to it, and the rest stay out of
the way while still findable. A plugin that gives general access, like Gmail, belongs to the whole profile and is at
hand everywhere; a workflow like email sorting belongs to the project where it keeps its rules
([profile or project](DECISIONS.md#d34)). How a workflow uses the mail plugin underneath — each plugin's skills read
together, or a shared set of commands — is settled plugin by plugin, by measuring what works
([no general rule](DECISIONS.md#d34)), and each plugin is built with its own evals ([each plugin its own
task](DECISIONS.md#d41)).

## Where plugins come from

In the first version every plugin in the marketplace ships inside the app and is updated with it. There is no store to
download from, and no plugin has a version of its own. The Plugins screen still looks like a store — a list, search,
tags — because that is where this is heading ([plugins ship with the app](DECISIONS.md#d36)).

The agent never installs anything loose, because the environment is rebuilt from what is declared and a loose install
would vanish ([why the environment is declared](DECISIONS.md#d25)). Asked to cut a video, it may need `ffmpeg`, a
script and a skill; it does not write a plugin for that, but adds them to the project's own setup, a hidden
`.piko/` folder in the project. Plugins are what one installs; a project's setup is what one makes, by talking
to the agent there ([what the agent builds lives in the project](DECISIONS.md#d43)). The folder holds only what the
agent wrote — skills, scripts, which libraries and programs they need — and the sandbox installs from it, so a project
moves as a handful of text files.

Programs such as Blender or `ffmpeg` are installed once for the whole sandbox, as long as some plugin or some project
needs them. Plugins share one set of libraries, since we build them all and resolve any clash before release; a
project's setup has its own, and its scripts use only those, never one a plugin happened to bring
([programs shared, libraries per project](DECISIONS.md#d44)). A skill of the project's setup is called by its plain
name, `/sort`: every plugin command carries its plugin's name before a colon, so one without it can only mean this
project's setup, and the daemon stops a conversation whose project has no such skill, as it does for a missing plugin
([commands of the project's setup](DECISIONS.md#d45)).

Inside `.piko/` the agent works as in any software project. JS libraries go in a `package.json` with its
lockfile, installed with `bun add` into the sandbox through a link; a Python script names its own dependencies in its
header and runs with `uv run`. When a setup is not installed yet — a project brought from another machine — the agent
installs it; the daemon reinstalls every setup only when it rebuilds the sandbox. System programs are listed in a small
file the daemon applies on request ([how a setup declares what it needs](DECISIONS.md#d46)). The agent learns what a
setup holds from an `AGENTS.md` inside `.piko/`, loaded into every conversation there; asked what a project can
do, it explains from that file ([the agent's description of a setup](DECISIONS.md#d47)). After changing a setup or a
schedule, the agent runs a check that every schedule's command exists ([what the check covers](DECISIONS.md#d48)).

## Installing without asking

The agent installs plugins on its own and says so in the conversation, with a card linking to the plugin's page. There
is no confirmation step, because a plugin gives the agent nothing beyond what it already has in its sandbox — except
through an account, and an account cannot be connected without the person going through the provider's sign-in
themselves ([what needs the person](DECISIONS.md#d28)). That sign-in happens once per account per profile; adding
Calendar to an already connected Google account costs one more "Allow" on Google's page
([one sign-in per account](DECISIONS.md#d16)). The sign-in itself stays with the app's background service: tools ask it
for a token valid for about an hour, so a web page that tricks the agent can leak at most that, never lasting access to
the mailbox ([who holds the sign-in](DECISIONS.md#d38)).

The other half of safety is in how tools are built. The mail plugin drafts and never sends; other plugins are limited
the same way, so that a page trying to steer the agent has as little to work with as possible.

## Setting up, running, removing

A plugin's setup conversation is an ordinary conversation led by its setup skill, and it starts right after
installation. When the agent installs the plugin, the setup carries on in the same conversation; when the person
installs it from the Plugins screen, a new conversation opens in the project they picked. Email sorting asks which mail
provider, starts that provider's sign-in, asks what kinds of mail arrive and what should happen to them, and when it
should run. The rules it learns go into the project as ordinary files the person can open and correct. Running it again
from the plugin's page changes the setup ([setup is a conversation](DECISIONS.md#d18)).

The plugin declares no schedule. When the person picks a time, the agent creates a schedule in the project, and that
schedule's whole instruction is the plugin's command — `/email-sorting:sort`, every command carrying the name of the
plugin it belongs to. A schedule can be created the same way in any
later conversation ([schedules are not part of a plugin](DECISIONS.md#d17)).

Removing a plugin never deletes the person's files and touches no schedule. The next run of a schedule that called the
removed plugin carries a command whose plugin is gone, and the app stops the conversation before the agent does
anything, with a message saying that plugin is not installed. The agent never recreates the workflow by reading old
files — the person removed the plugin to make it stop. But the conversation stays open: if the removal was a mistake,
the person says "install it back" and the agent, seeing what happened, carries on
([what a missing command does](DECISIONS.md#d42)).

## Still open

Whether a schedule the agent creates on its own needs the person's confirmation is decided after schedules are built
([#35](https://github.com/kedrzu/piko/issues/35)). How a plugin installs a Linux system program — from the
distribution's packages or as a pinned download — waits for the first plugin that needs one
([deferred](DECISIONS.md#d26)).

The person's own plugins are a later design. Once a project's own setup — its skills, scripts and the packages they
need — is wanted in several projects, the agent will turn it into a plugin of the person's, kept in the profile and
installed into those projects. Moving a skill into a plugin changes its command's name, so the agent then has to repoint
whatever called it, schedules first; the check the agent already runs after its changes catches a command it missed.
