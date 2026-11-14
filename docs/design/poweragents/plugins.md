# Plugins

A plugin is how the agent gains a capability it doesn't ship with: reading the person's mail, sorting it every morning,
modelling in Blender. People install capabilities, not tools — "email sorting", not "a Gmail server" — and most of them
will never build a plugin by hand. Yet a few weeks in, many will have one of their own without noticing, because the
agent builds them when asked for something new.

## What a plugin is made of

There is one kind of plugin, made of whatever parts it needs: instructions for the agent (skills), tools, a setup
conversation that runs right after installing it, and programs added to the agent's environment. "Workflows",
"creative", "for work" are only tags for browsing the marketplace ([why one kind](DECISIONS.md#d17)).

Three plugins show the range. **Gmail** gives the agent the person's mail: tools that read it and create drafts but never
send, a short skill on how to use them, and a Google sign-in. **Email sorting** is a workflow: it creates a project
called "Poczta", where it keeps the sorting rules it learns, carries the skill that sorts and a setup conversation, and
needs a mail plugin to work with — Gmail or Outlook. **Blender** adds the program to the environment and a skill for
driving it from scripts.

On disk a plugin is a folder: a `plugin.json` describing it (its marketplace text in every app language, tags, whether it
belongs to the profile or to a project, the project it creates, the plugins it works with, the accounts it uses, what it
adds to the environment), its skills, and the code of its tools ([the plugin's folder](DECISIONS.md#d39)).

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

The other source is the agent. Asked to cut a video, it may need `ffmpeg`; it never installs anything loose, because
the environment is rebuilt from the list of installed plugins and a loose install would vanish
([why the environment is declared](DECISIONS.md#d25)). Instead it writes a small plugin of its own: a folder in the profile, which is installed by being there. These
plugins live with the person's data, survive a rebuilt environment, and appear in the
same list as the bundled ones, marked as the person's own — "Twój plugin" — since they asked for it
([plugins the agent writes](DECISIONS.md#d40)). When the agent improves the skill of such a plugin, the next
conversation already uses it.

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

A plugin with a setup conversation starts it right after installation, in its project: email sorting asks which mail
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
([#35](https://github.com/kedrzu/poweragents/issues/35)). How a plugin installs a Linux system program — from the
distribution's packages or as a pinned download — waits for the first plugin that needs one
([deferred](DECISIONS.md#d26)).
