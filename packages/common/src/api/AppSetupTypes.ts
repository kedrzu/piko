import type { AppLanguage } from '../appLanguages.js';
import type { ConversationRef } from './ConversationTypes.js';

/** What the app asks App setup to start with. */
export interface AppSetupStartInput {
    /** The app's language: the agent greets the person in it. */
    language: AppLanguage;
    /** The onboarding conversation's title, in the app's language. */
    conversationTitle: string;
}

/** How asking for App setup ended. */
export interface AppSetupStartResult {
    /**
     * The onboarding conversation, the agent already greeting the person in it, when it was started just now (App setup
     * created just now, or an earlier start that failed finished); `null` when it had been started before, App setup is
     * gone (deleted by the person) or the onboarding could not be started.
     */
    onboarding: ConversationRef | null;
}
