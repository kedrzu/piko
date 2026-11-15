import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import { APP_LANGUAGES } from '../appLanguages.js';
import { readString } from '../utils/readString.js';
import type { PluginInstallInput, PluginInstallOutcome } from './PluginTypes.js';
import { createInputSchema } from './utils/createInputSchema.js';
import { parsePluginTargetInput } from './utils/parsePluginTargetInput.js';

const input = createInputSchema<PluginInstallInput>(
    `{ name: string, projectId?: string, language: ${APP_LANGUAGES.map(language => `'${language}'`).join(' | ')}, conversationTitle?: string }`,
    value => {
        const target = parsePluginTargetInput(value);
        const language = APP_LANGUAGES.find(candidate => candidate === readString(value, 'language'));
        const conversationTitle = readString(value, 'conversationTitle');
        if (!target || language === undefined || ('conversationTitle' in value && conversationTitle === undefined)) {
            return undefined;
        }
        return conversationTitle === undefined ? { ...target, language } : { ...target, language, conversationTitle };
    },
);

/**
 * Installs a plugin and, when it has an onboarding skill, starts a conversation in the given project where the agent
 * runs it and speaks first; installing an installed plugin starts the onboarding again. Answers 404 `PluginNotFound`,
 * 409 `PluginInvalid`, 400 `PluginLevelMismatch` (a `project` plugin without a project), 400 `ProjectRequired` (a
 * `profile` plugin with an onboarding skill and no project to start it in) and 404 `ProjectNotFound`, installing
 * nothing. An onboarding that cannot start leaves the plugin installed and says why in `onboardingError`.
 */
export const PluginInstallEndpoint = defineEndpoint<PluginInstallInput, PluginInstallOutcome>({
    name: 'plugins/install',
    input,
});
