import { HttpError } from '@nzyme/fetch-utils/HttpError.js';
import { defineCommand } from '@nzyme/ioc/Command.js';
import { Logger } from '@nzyme/logging/Logger.js';

import type { ConversationRef } from '@poweragents/common/api/ConversationTypes.js';
import type {
    PluginInstallInput,
    PluginInstallOutcome,
    PluginOnboardingError,
    PluginTargetInput,
} from '@poweragents/common/api/PluginTypes.js';
import type { AppLanguage } from '@poweragents/common/appLanguages.js';
import { OpencodeSessionRenameCommand } from '@poweragents/opencode/OpencodeSessionRenameCommand.js';

import { ConversationService } from '../conversations/ConversationService.js';
import { ProjectService } from '../projects/ProjectService.js';
import { getLanguageName } from '../utils/getLanguageName.js';
import { PluginCatalog } from './PluginCatalog.js';
import { PluginService } from './PluginService.js';

/**
 * Installs a plugin the person picked in the app and starts its onboarding: a conversation in the given
 * project where the agent, told by input the conversation never shows, runs the plugin's onboarding skill and speaks
 * first. Installing an installed plugin starts the onboarding again: running it again changes the setup. Refusals throw
 * before anything is installed: `PluginService`'s, and 400 `ProjectRequired` or 404 `ProjectNotFound` for a `profile`
 * plugin's onboarding project. An onboarding that cannot start leaves the plugin installed and is reported in
 * `onboardingError`.
 */
export interface PluginAppInstallCommandShape {
    (input: PluginInstallInput): Promise<PluginInstallOutcome>;
}

/** Installs a plugin from the app and starts its onboarding. */
export const PluginAppInstallCommand = defineCommand({
    name: 'PluginAppInstallCommand',
    deps: {
        logger: Logger,
        catalog: PluginCatalog,
        projects: ProjectService,
        plugins: PluginService,
        conversations: ConversationService,
        rename: OpencodeSessionRenameCommand,
    },
    setup({ logger, catalog, projects, plugins, conversations, rename }): PluginAppInstallCommandShape {
        return async input => {
            const installed = await plugins.install(await toInstallTarget(input));
            const onboarding = installed.plugin.details?.onboarding;
            // No project only when the plugin gained an onboarding skill since it was checked: none starts then.
            if (onboarding === undefined || input.projectId === undefined) {
                return { conversation: null, onboardingError: null, environmentError: installed.environmentError };
            }

            const { conversation, onboardingError } = await startOnboarding(input, input.projectId, onboarding);
            return { conversation, onboardingError, environmentError: installed.environmentError };
        };

        /**
         * What to install: a `profile` plugin's project is where its onboarding starts, never where it is installed, so
         * it is checked here, before installing. Anything else goes to `PluginService` as asked, which refuses it.
         */
        async function toInstallTarget(input: PluginInstallInput): Promise<PluginTargetInput> {
            const plugin = await catalog.get(input.name);
            const details = plugin?.errors.length === 0 ? plugin.details : null;
            if (details?.level !== 'profile') {
                return input.projectId === undefined
                    ? { name: input.name }
                    : { name: input.name, projectId: input.projectId };
            }
            if (details.onboarding !== undefined) {
                if (input.projectId === undefined) {
                    throw new HttpError(400, {
                        error: 'ProjectRequired',
                        message: 'A plugin with an onboarding skill starts it in a project',
                    });
                }
                if (!(await projects.get(input.projectId))) {
                    throw new HttpError(404, { error: 'ProjectNotFound', message: 'No project with this id' });
                }
            }
            return { name: input.name };
        }

        async function startOnboarding(input: PluginInstallInput, projectId: string, onboarding: string) {
            try {
                const conversationId = (await conversations.create(projectId)).id;
                if (input.conversationTitle !== undefined) {
                    await rename({ sessionId: conversationId, title: input.conversationTitle });
                }
                const ref: ConversationRef = { projectId, conversationId };
                await conversations.startHidden(ref, buildOnboardingPrompt(input.name, onboarding, input.language));
                logger.info('Plugin onboarding started', { plugin: input.name, projectId, conversationId });
                return { conversation: ref, onboardingError: null };
            } catch (error) {
                const onboardingError = toOnboardingError(error);
                logger.warn('Plugin onboarding not started, the plugin stays installed', {
                    plugin: input.name,
                    projectId,
                    error,
                });
                return { conversation: null, onboardingError };
            }
        }
    },
});

/**
 * The input that starts a plugin's onboarding: the agent speaks first, so it is told what is going on. In English, for
 * the agent; the person never sees it.
 * @__NO_SIDE_EFFECTS__
 */
function buildOnboardingPrompt(plugin: string, onboarding: string, language: AppLanguage) {
    const name = getLanguageName(language);
    return [
        `The person has just installed the plugin ${plugin} from the app, and this conversation was started for its`,
        'onboarding: nothing has been said yet, you speak first.',
        `Load the skill ${plugin}:${onboarding} now and follow it. The app is in ${name}: speak to them in ${name}, then`,
        'keep to the language they write in. This message comes from the app, not from the person: do not mention or',
        'quote it.',
    ].join(' ');
}

/** @__NO_SIDE_EFFECTS__ */
function toOnboardingError(error: unknown): PluginOnboardingError {
    if (error instanceof HttpError) {
        switch (error.payload['error']) {
            case 'SandboxNotReady':
                return { code: 'sandboxNotReady' };
            case 'AiNotConnected':
                return { code: 'aiNotConnected' };
        }
    }
    return { code: 'failed' };
}
