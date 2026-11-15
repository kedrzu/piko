import type { AiProvider } from './AiTypes.js';
import type { ConversationError, ConversationRunOutcome, ConversationStep } from './ConversationTypes.js';

/**
 * Where the daemon streams its events as server-sent events (`GET`): each event's `data` is one {@link DaemonEvent} as
 * JSON. Served to the app's origins only, like the rest of the API.
 */
export const DAEMON_EVENTS_PATH = '/api/events';

/** An event the daemon streams, discriminated by `type`. */
export type DaemonEvent =
    | ConversationEvent
    | DataRootEvent
    | FileAgentChangedEvent
    | PluginsChangedEvent
    | PluginInstalledEvent
    | DaemonStreamRestoredEvent;

/**
 * Something changed in the profile's data root, by the agent, the person or this daemon. Sent once for a burst of
 * changes; the app reloads what it shows.
 */
export type DataRootEvent = ProjectsChangedEvent | ProjectFilesChangedEvent | MemoryChangedEvent;

/** A project folder appeared, went, was renamed, or its marker changed: the project list may differ. */
export interface ProjectsChangedEvent {
    type: 'projectsChanged';
}

/**
 * A file or folder inside a project's folder changed (not its marker: that is {@link ProjectsChangedEvent}). Sent once
 * per project for a burst of changes; after the daemon's watcher was down, once for every project.
 */
export interface ProjectFilesChangedEvent {
    type: 'projectFilesChanged';
    projectId: string;
}

/** A file or folder in the Memory folder changed. */
export interface MemoryChangedEvent {
    type: 'memoryChanged';
}

/** A plugin was installed or removed: the plugin list and its installs may differ. */
export interface PluginsChangedEvent {
    type: 'pluginsChanged';
}

/**
 * The agent installed a plugin from a conversation (a new installation also sends `pluginsChanged`). Sent also
 * when it installs a plugin installed already, or its own plugin, which applies the plugin's environment again.
 */
export interface PluginInstalledEvent {
    type: 'pluginInstalled';
    /** The plugin's name. */
    plugin: string;
    /** The conversation's project: where a `project` plugin was installed. */
    projectId: string;
    conversationId: string;
}

/**
 * What the agent is doing to a project file: `waiting` while it holds its change because the person is typing in the
 * file (she can still edit it), else `writing` while a tool call that writes it runs.
 */
export type FileAgentState = 'writing' | 'waiting';

/**
 * The agent's state on a project file changed. Sent for every file in a non-`null` state as soon as a client connects,
 * and `null` once its tool call ends, its run ends or the daemon's feed of the agent's events is restored.
 */
export interface FileAgentChangedEvent {
    type: 'fileAgentChanged';
    projectId: string;
    /** Relative to the project's folder, with `/`. */
    path: string;
    /** The conversation whose agent does it, or did it last when `state` is `null`. */
    conversationId: string;
    state: FileAgentState | null;
}

/**
 * The daemon lost its own feed of the agent's events and got it back: whatever happened meanwhile was not streamed, so
 * the app reloads what it shows.
 */
export interface DaemonStreamRestoredEvent {
    type: 'streamRestored';
}

/** Something happened in a conversation. */
export type ConversationEvent =
    | ConversationCreatedEvent
    | ConversationRenamedEvent
    | ConversationRunningChangedEvent
    | ConversationTextDeltaEvent
    | ConversationStepStartedEvent
    | ConversationStepFinishedEvent
    | ConversationStepFailedEvent
    | ConversationRunFinishedEvent;

/** A conversation was started in a project, by this app or another client. */
export interface ConversationCreatedEvent {
    type: 'conversationCreated';
    conversationId: string;
    projectId: string;
    title?: string;
    /** The provider the conversation's agent runs on; absent for one the app does not run the agent on. */
    provider?: AiProvider;
}

/** A conversation got its title. */
export interface ConversationRenamedEvent {
    type: 'conversationRenamed';
    conversationId: string;
    title: string;
}

/** The agent started or stopped working on a conversation. */
export interface ConversationRunningChangedEvent {
    type: 'runningChanged';
    conversationId: string;
    running: boolean;
}

/** The next piece of text the agent is writing. */
export interface ConversationTextDeltaEvent {
    type: 'textDelta';
    conversationId: string;
    /** The agent message the text belongs to, as listed in the conversation's messages. */
    messageId: string;
    delta: string;
}

/** The agent began a step. */
export interface ConversationStepStartedEvent {
    type: 'stepStarted';
    conversationId: string;
    step: ConversationStep;
}

/** A step finished. */
export interface ConversationStepFinishedEvent {
    type: 'stepFinished';
    conversationId: string;
    stepId: string;
}

/** A step failed; the agent usually goes on. */
export interface ConversationStepFailedEvent {
    type: 'stepFailed';
    conversationId: string;
    stepId: string;
    /** As the tool said. */
    error: string;
}

/** A run ended. */
export interface ConversationRunFinishedEvent {
    type: 'runFinished';
    conversationId: string;
    outcome: ConversationRunOutcome;
    /** Why, when `outcome` is `failed`. */
    error?: ConversationError;
}
