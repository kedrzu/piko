import { HttpError } from '@nzyme/fetch-utils/HttpError.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { assertNever } from '@nzyme/utils/assertNever.js';

import type { AiProvider } from '@poweragents/common/api/AiTypes.js';
import type {
    Conversation,
    ConversationMessage,
    ConversationMessageListInput,
    ConversationMessagePage,
    ConversationRef,
    ConversationSendInput,
    ConversationSendResult,
    ConversationStopResult,
} from '@poweragents/common/api/ConversationTypes.js';
import type { PluginInfo } from '@poweragents/common/api/PluginTypes.js';
import { OpencodeMessageListCommand } from '@poweragents/opencode/OpencodeMessageListCommand.js';
import { OpencodeSessionActiveListCommand } from '@poweragents/opencode/OpencodeSessionActiveListCommand.js';
import { OpencodeSessionCreateCommand } from '@poweragents/opencode/OpencodeSessionCreateCommand.js';
import { OpencodeSessionGetCommand } from '@poweragents/opencode/OpencodeSessionGetCommand.js';
import { OpencodeSessionInboxClearCommand } from '@poweragents/opencode/OpencodeSessionInboxClearCommand.js';
import { OpencodeSessionInboxListCommand } from '@poweragents/opencode/OpencodeSessionInboxListCommand.js';
import type { OpencodeInboxItem } from '@poweragents/opencode/OpencodeSessionInboxListCommand.js';
import { OpencodeSessionInterruptCommand } from '@poweragents/opencode/OpencodeSessionInterruptCommand.js';
import { OpencodeSessionListCommand } from '@poweragents/opencode/OpencodeSessionListCommand.js';
import { OpencodeSessionPromptCommand } from '@poweragents/opencode/OpencodeSessionPromptCommand.js';
import { OpencodeSessionSyntheticCommand } from '@poweragents/opencode/OpencodeSessionSyntheticCommand.js';
import { OpencodeSessionUpdateCommand } from '@poweragents/opencode/OpencodeSessionUpdateCommand.js';
import type { OpencodeSession } from '@poweragents/opencode/OpencodeTypes.js';

import { AiProviderService } from '../ai/AiProviderService.js';
import { toAiProvider } from '../ai/utils/toAiProvider.js';
import { CHATGPT_INTEGRATION } from '../chatgpt/ChatgptSignInService.js';
import { CLAUDE_INTEGRATION } from '../claude/ClaudeSignInService.js';
import { PluginService } from '../plugins/PluginService.js';
import { buildSkillDenyRules } from '../plugins/utils/buildSkillDenyRules.js';
import { ProjectService } from '../projects/ProjectService.js';
import { assertSandboxReady } from '../sandbox/assertSandboxReady.js';
import { Sandbox } from '../sandbox/Sandbox.js';
import { parsePluginCommand } from './utils/parsePluginCommand.js';
import type { PluginCommand } from './utils/parsePluginCommand.js';
import { PLUGIN_MISSING_NOTE, readPluginMissingNote } from './utils/readPluginMissingNote.js';
import { toAgentDir } from './utils/toAgentDir.js';
import { toConversationMessage } from './utils/toConversationMessage.js';

/**
 * The person's conversations with the agent, each bound to one project: OpenCode sessions whose working directory is
 * the project's folder in the sandbox. They live only in OpenCode's storage; the daemon keeps no copy. Every method
 * needs a ready sandbox (`HttpError` 409 `SandboxNotReady`), throws `HttpError` 404 `ProjectNotFound` for an unknown
 * project and `ConversationNotFound` for a conversation that is not in the given project's folder — never one of
 * another project. A conversation sees the skills of the plugins installed in the profile and in its own project only:
 * the daemon owns each session's permission list, set when the conversation starts and again before every message. This
 * service is the only way the daemon prompts the agent.
 */
export interface ConversationServiceShape {
    /** The project's conversations, the most recently changed first. */
    list(projectId: string): Promise<Conversation[]>;
    /**
     * Starts an empty conversation in the project, with the agent on the active provider's default model (design D35):
     * Claude Sonnet or ChatGPT's Terra. The conversation keeps that model. Throws `HttpError` 409 `AiNotConnected` when
     * no provider is connected on an allowed plan. Syncs the plugins' copies first, so an own plugin's edited skill is
     * current in the new conversation.
     */
    create(projectId: string): Promise<Conversation>;
    /**
     * Sends the person's message; the agent's work on it streams as events. A message starting with a plugin's command
     * (`/<plugin>:<skill>`) goes out with the skill attached when the plugin is installed in the profile or in this
     * project. When it is not (design D42), no run starts: the message waits beside a note telling the agent the command
     * was not run, and the person's next message delivers both.
     */
    send(input: ConversationSendInput): Promise<ConversationSendResult>;
    /**
     * Gives the agent input the conversation never shows (App setup's opening instruction, say) and starts a run on it.
     */
    startHidden(ref: ConversationRef, text: string): Promise<void>;
    /**
     * Stops the agent's work on the conversation and withdraws the messages still waiting for it, with the notes that a
     * plugin's command was not run.
     */
    stop(ref: ConversationRef): Promise<ConversationStopResult>;
    /**
     * A page of the conversation's messages, counting back from the newest. The newest page ends with the messages still
     * waiting for the agent.
     */
    listMessages(input: ConversationMessageListInput): Promise<ConversationMessagePage>;
}

/** OpenCode's model a new conversation runs on, per provider (design D35). */
interface AgentModel {
    providerId: string;
    modelId: string;
}

/** Messages per page: a screen's worth and more, well under OpenCode's maximum of 200. */
const MESSAGE_PAGE_SIZE = 50;

/** The person's conversations with the agent, per project. */
export const ConversationService = defineService({
    name: 'ConversationService',
    deps: {
        logger: Logger,
        projects: ProjectService,
        sandbox: Sandbox,
        aiProvider: AiProviderService,
        listSessions: OpencodeSessionListCommand,
        getSession: OpencodeSessionGetCommand,
        listActiveSessions: OpencodeSessionActiveListCommand,
        createSession: OpencodeSessionCreateCommand,
        prompt: OpencodeSessionPromptCommand,
        synthetic: OpencodeSessionSyntheticCommand,
        updateSession: OpencodeSessionUpdateCommand,
        interrupt: OpencodeSessionInterruptCommand,
        clearInbox: OpencodeSessionInboxClearCommand,
        listInbox: OpencodeSessionInboxListCommand,
        listMessages: OpencodeMessageListCommand,
        plugins: PluginService,
    },
    setup(deps): ConversationServiceShape {
        const { logger, projects, sandbox, plugins } = deps;

        return { list, create, send, startHidden, stop, listMessages };

        async function list(projectId: string) {
            const directory = await requireProjectDir(projectId);
            const [sessions, active] = await Promise.all([deps.listSessions(directory), deps.listActiveSessions()]);
            return (
                sessions
                    // OpenCode filters by the directory already; checked again, as a conversation must never show in
                    // another project.
                    .filter(session => session.directory === directory)
                    .toSorted((a, b) => b.updatedAt - a.updatedAt)
                    .map(session => toConversation(session, active.has(session.id)))
            );
        }

        async function create(projectId: string) {
            const directory = await requireProjectDir(projectId);
            const provider = await deps.aiProvider.getActive();
            if (provider === undefined) {
                throw new HttpError(409, {
                    error: 'AiNotConnected',
                    message: 'No AI provider is connected on a plan the agent can use',
                });
            }
            await syncPlugins();
            const session = await deps.createSession({
                directory,
                ...toAgentModel(provider),
                permissions: buildSkillDenyRules(projectId, await plugins.list()),
            });
            logger.info('Conversation created', { projectId, conversationId: session.id, provider });
            return toConversation(session, false);
        }

        async function send(input: ConversationSendInput): Promise<ConversationSendResult> {
            await requireConversation(input);
            const installed = await refreshPermissions(input);
            const sessionId = input.conversationId;
            // OpenCode admits a message sent while the agent works too: it waits in the session's inbox and is given
            // to the agent at its next step, within the same run. A run ending in between starts a new one instead;
            // the message is reported as queued either way. A waiting message keeps its inbox id once delivered.
            const queued = (await deps.listActiveSessions()).has(sessionId);
            const command = parsePluginCommand(input.text);
            if (!command) {
                const receipt = await deps.prompt({ sessionId, text: input.text });
                return { queued, messageId: receipt.messageId };
            }

            const details = findVisiblePlugin(installed, command.plugin, input.projectId);
            if (details) {
                // A skill the plugin lacks is the agent's to answer, as any message.
                const skills = details.skills.includes(command.skill)
                    ? [`${command.plugin}:${command.skill}`]
                    : undefined;
                const receipt = await deps.prompt({ sessionId, text: input.text, skills });
                return { queued, messageId: receipt.messageId };
            }

            // Both wait in the inbox, the message first: the agent reads them with the person's next message and never
            // works on a plugin it does not have (design D42).
            const receipt = await deps.prompt({ sessionId, text: input.text, resume: false });
            await deps.synthetic({
                sessionId,
                text: buildPluginMissingNote(command),
                metadata: { ...PLUGIN_MISSING_NOTE, plugin: command.plugin },
                resume: false,
            });
            logger.info('Plugin command not run, the plugin is not installed here', {
                projectId: input.projectId,
                conversationId: sessionId,
                plugin: command.plugin,
            });
            return { queued, messageId: receipt.messageId, stoppedBy: { plugin: command.plugin } };
        }

        async function startHidden(ref: ConversationRef, text: string) {
            await requireConversation(ref);
            await refreshPermissions(ref);
            await deps.synthetic({ sessionId: ref.conversationId, text });
        }

        async function stop(ref: ConversationRef) {
            await requireConversation(ref);
            const stopped = await deps.interrupt(ref.conversationId);
            // Interrupted, the session delivers nothing more, so every message still in its inbox is one the agent never
            // read. Left there, it would start the next run along with the person's next message; so would a note that
            // a plugin's command was not run, withdrawn with the command.
            const withdrawn = await deps.clearInbox(ref.conversationId, { syntheticMetadata: PLUGIN_MISSING_NOTE });
            return { stopped, withdrawn };
        }

        async function listMessages(input: ConversationMessageListInput) {
            await requireConversation(input);
            const page = await deps.listMessages({
                sessionId: input.conversationId,
                olderCursor: input.olderCursor,
                limit: MESSAGE_PAGE_SIZE,
            });
            const messages: ConversationMessage[] = [];
            for (const message of page.messages) {
                const mapped = toConversationMessage(message);
                if (mapped) {
                    messages.push(mapped);
                }
            }
            if (input.olderCursor === undefined) {
                // Listed after the messages: one delivered in between is missed until the next read, never shown twice.
                for (const item of await deps.listInbox(input.conversationId)) {
                    const mapped = toWaitingMessage(item);
                    if (mapped) {
                        messages.push(mapped);
                    }
                }
            }
            return { messages, olderCursor: page.olderCursor };
        }

        /** The project's folder as the agent sees it. */
        async function requireProjectDir(projectId: string) {
            assertSandboxReady(sandbox);
            const project = await projects.get(projectId);
            if (!project) {
                throw new HttpError(404, { error: 'ProjectNotFound', message: 'No project with this id' });
            }
            return toAgentDir(project.dir);
        }

        /**
         * Sets the conversation's permissions to what the plugins installed now allow, before a message starts or joins a
         * run: an installation or removal since the last message reaches an open conversation this way. The list is built
         * in full, as OpenCode replaces it rather than merging. Returns the plugins it was built from.
         */
        async function refreshPermissions(ref: ConversationRef) {
            const installed = await plugins.list();
            await deps.updateSession({
                sessionId: ref.conversationId,
                permissions: buildSkillDenyRules(ref.projectId, installed),
            });
            return installed;
        }

        /** A failed sync leaves the previous copies in place, which beats refusing the conversation. */
        async function syncPlugins() {
            try {
                await plugins.sync();
            } catch (error) {
                logger.warn('Plugins not synced before the conversation', { error });
            }
        }

        async function requireConversation(ref: ConversationRef) {
            const directory = await requireProjectDir(ref.projectId);
            const session = await deps.getSession(ref.conversationId);
            if (session?.directory !== directory) {
                throw new HttpError(404, {
                    error: 'ConversationNotFound',
                    message: 'No conversation with this id in the project',
                });
            }
        }
    },
});

/** @__NO_SIDE_EFFECTS__ */
function toAgentModel(provider: AiProvider): AgentModel {
    switch (provider) {
        case 'claude':
            return { providerId: CLAUDE_INTEGRATION, modelId: 'sonnet' };
        case 'chatgpt':
            // Terra's id as OpenCode lists it (`GET /api/model`).
            return { providerId: CHATGPT_INTEGRATION, modelId: 'gpt-6.1-terra' };
        default:
            return assertNever(provider);
    }
}

/**
 * The details of the plugin named `name` that a conversation in `projectId` sees: loaded, and installed in the profile or
 * in that project. An own plugin in conflict with a bundled one is not loaded; the bundled one is looked at alone.
 * @__NO_SIDE_EFFECTS__
 */
function findVisiblePlugin(plugins: PluginInfo[], name: string, projectId: string) {
    for (const plugin of plugins) {
        if (plugin.name !== name || !plugin.details || plugin.errors.length > 0) {
            continue;
        }
        if (plugin.installs.some(install => 'profile' in install || install.projectId === projectId)) {
            return plugin.details;
        }
    }
    return undefined;
}

/**
 * What the agent is told beside a command it is not to run. In English, for the agent; the app words the note for the
 * person itself.
 * @__NO_SIDE_EFFECTS__
 */
function buildPluginMissingNote(command: PluginCommand) {
    return [
        `The command /${command.plugin}:${command.skill} was not run: the plugin ${command.plugin} is not installed here.`,
        "Tell the person only if they ask. Do not do the task another way, e.g. by reading the plugin's files.",
        'If the person installs it again, continue.',
    ].join(' ');
}

/** A message still waiting in the inbox as the conversation shows it; `undefined` for input the person never sees. */
function toWaitingMessage(item: OpencodeInboxItem): ConversationMessage | undefined {
    switch (item.type) {
        case 'prompt':
            return { type: 'user', id: item.id, createdAt: item.createdAt, text: item.text, pending: true };
        case 'synthetic': {
            const plugin = readPluginMissingNote(item.metadata);
            return plugin === undefined
                ? undefined
                : { type: 'pluginMissing', id: item.id, createdAt: item.createdAt, plugin };
        }
        default:
            return assertNever(item.type);
    }
}

function toConversation(session: OpencodeSession, running: boolean): Conversation {
    return {
        id: session.id,
        title: session.title,
        updatedAt: session.updatedAt,
        running,
        provider: toAiProvider(session.providerId),
    };
}
