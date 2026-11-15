import type { AppLanguage } from '../appLanguages.js';
import type { ConversationRef } from './ConversationTypes.js';

/**
 * Where a plugin comes from: `bundled` ships with the app (design D36), `own` is a folder the person or the agent made in
 * the data root's `plugins/` (D40), installed by being there.
 */
export type PluginSource = 'bundled' | 'own';

/** Where a plugin is installed (D34): in the whole profile, or in one project at a time. An own plugin is always `profile`. */
export type PluginLevel = 'profile' | 'project';

/** How a plugin presents itself in the marketplace, in one app language. */
export interface PluginMarketplaceText {
    title: string;
    description: string;
}

/** One installation of a plugin: in the profile (a `profile` plugin) or in one project (a `project` plugin). */
export type PluginInstall = { profile: true } | { projectId: string };

/** What a plugin declares in its `plugin.json`, with the skills found in its `skills/` folder. */
export interface PluginDetails {
    level: PluginLevel;
    tags: string[];
    marketplace: Record<AppLanguage, PluginMarketplaceText>;
    /** The skill the agent runs when the plugin is installed; one of {@link skills}. */
    onboarding?: string;
    /** The names of its skills (`skills/<name>/SKILL.md`), sorted; each becomes the skill `<plugin>:<name>`. */
    skills: string[];
}

/** What is wrong with a plugin. */
export type PluginError =
    /** The plugin's folder is a link or a file: it is never read through. */
    | { code: 'notFolder' }
    /** The plugin's files could not be read: no permission, say. */
    | { code: 'unreadable' }
    | { code: 'manifestMissing' }
    /** `plugin.json` is a link or anything but a file: it is never read through. */
    | { code: 'manifestNotFile' }
    /** `plugin.json` is over 64 KB. */
    | { code: 'manifestTooLarge' }
    | { code: 'manifestNotJson' }
    /** `field` is the path of the invalid field in `plugin.json`: `name`, `environment.npm.left-pad`; empty
     * when the file is not a JSON object. */
    | { code: 'invalidField'; field: string }
    /** The name in `plugin.json` differs from the plugin's folder name. */
    | { code: 'nameMismatch' }
    /** An own plugin declares the level `project`: own plugins are always profile-level. */
    | { code: 'projectLevel' }
    /** An own plugin is named like a bundled one, which wins (D42). */
    | { code: 'conflict' }
    /** `skills/` is a link or a file. */
    | { code: 'skillsNotFolder' }
    /** A skill folder with an invalid name, a link instead of a folder, or no `SKILL.md` file. */
    | { code: 'invalidSkill'; skill: string }
    /** The onboarding skill is not among the plugin's skills. */
    | { code: 'onboardingMissing'; skill: string };

/** A part of the agent's environment: Node packages (npm pins and plugin CLIs) or Python packages. */
export type PluginEnvironmentPart = 'npm' | 'python';

/**
 * Why a plugin's additions to the agent's environment (its CLI, npm and Python packages) are not there. The plugin stays
 * installed and its skills work; the daemon applies the environment again when the sandbox next becomes ready and after
 * every installation or removal.
 */
export type PluginEnvironmentError =
    /**
     * The plugin pins `package` at another version than `plugin` does, which comes first by name and wins: none of this
     * plugin's environment is applied.
     */
    | { code: 'conflict'; part: PluginEnvironmentPart; package: string; plugin: string }
    /**
     * Installing `part` failed for every plugin adding to it. `output` is the end of what the failed command printed
     * (bounded), for the agent or the person to read; `exitCode` is `null` when the command could not be run at all.
     */
    | { code: 'applyFailed'; part: PluginEnvironmentPart; exitCode: number | null; output: string };

/** A plugin as the app lists it, from either source. */
export interface PluginInfo {
    /** The plugin's folder name, which a valid plugin's `plugin.json` repeats. */
    name: string;
    source: PluginSource;
    /** `null` when `plugin.json` could not be read or is invalid; `errors` say why. */
    details: PluginDetails | null;
    /** Where it is installed; empty when it is not. */
    installs: PluginInstall[];
    /** Why the plugin is not loaded; empty for a plugin that is. A plugin with errors is never installed nor used. */
    errors: PluginError[];
    /** Why its environment is not applied, from the last apply; `null` when it is, or the plugin is not installed. */
    environmentError: PluginEnvironmentError | null;
}

/** A plugin to install or remove, and where. */
export interface PluginTargetInput {
    name: string;
    /** The project of a `project` plugin; absent for a `profile` one. */
    projectId?: string;
}

/** What the app asks to install a plugin with. */
export interface PluginInstallInput extends PluginTargetInput {
    /**
     * For a `project` plugin the project it is installed in, where its onboarding starts too. For a `profile` plugin the
     * project its onboarding starts in: required when it has an onboarding skill, ignored otherwise.
     */
    projectId?: string;
    /** The app's language: the agent speaks to the person in it in the onboarding conversation. */
    language: AppLanguage;
    /** The onboarding conversation's title, in the app's language; OpenCode's own title when absent. */
    conversationTitle?: string;
}

/** Why a plugin's onboarding conversation did not start. The plugin stays installed either way. */
export type PluginOnboardingError =
    /** The sandbox is not ready: the app shows its progress, and the person can install the plugin again. */
    | { code: 'sandboxNotReady' }
    /** No AI provider is connected on a plan the agent can use. */
    | { code: 'aiNotConnected' }
    /** Anything else; the daemon logs it. */
    | { code: 'failed' };

/** How installing a plugin from the app ended: the plugin is installed. */
export interface PluginInstallOutcome {
    /**
     * The onboarding conversation, the agent already running the plugin's onboarding skill in it; `null` when the plugin
     * has no onboarding skill or its onboarding did not start ({@link onboardingError}).
     */
    conversation: ConversationRef | null;
    /** Why the onboarding did not start; `null` when it did or there is none. */
    onboardingError: PluginOnboardingError | null;
    /** Why the plugin's environment is not applied; `null` when it is, or the sandbox is not ready to apply it. */
    environmentError: PluginEnvironmentError | null;
}

/** How removing a plugin ended: nothing to report, a failure throws. */
export type PluginRemoveResult = Record<string, never>;
