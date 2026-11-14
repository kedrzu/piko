import { defineService } from '@nzyme/ioc/Service.js';
import { assertNever } from '@nzyme/utils/assertNever.js';

import type { AiProvider, AiStatus } from '@poweragents/common/api/AiTypes.js';

import { ChatgptSignInService } from '../chatgpt/ChatgptSignInService.js';
import { ClaudeSignInService } from '../claude/ClaudeSignInService.js';
import { ActiveProviderStore } from './ActiveProviderStore.js';

/**
 * The AI provider the agent runs on. The recorded one (`ActiveProviderStore`) when there is a record, connected or not;
 * without one, Claude when it is connected (an install from before the record), else ChatGPT when it is connected. The
 * fallback never writes the record: only a sign-in does. A status check needs a ready sandbox and throws an `HttpError`
 * 409 (`SandboxNotReady`) otherwise; a status check that fails throws.
 */
export interface AiProviderServiceShape {
    /** The active provider's sign-in; `provider: null` when none is recorded and none is connected. */
    getStatus(): Promise<AiStatus>;
    /**
     * The provider new conversations run on: the recorded one as it is, unchecked (a signed-out one shows on the first
     * message, as an ended sign-in does); without a record, the fallback's provider when it is connected on an allowed
     * plan; `undefined` otherwise.
     */
    getActive(): Promise<AiProvider | undefined>;
}

/** Which AI provider is active, and its sign-in. */
export const AiProviderService = defineService({
    name: 'AiProviderService',
    deps: { store: ActiveProviderStore, claude: ClaudeSignInService, chatgpt: ChatgptSignInService },
    setup({ store, claude, chatgpt }): AiProviderServiceShape {
        return { getStatus, getActive };

        async function getStatus(): Promise<AiStatus> {
            const recorded = await store.get();
            if (recorded !== undefined) {
                return getProviderStatus(recorded);
            }

            const claudeStatus = await getProviderStatus('claude');
            if (claudeStatus.connected) {
                return claudeStatus;
            }
            const chatgptStatus = await getProviderStatus('chatgpt');
            if (chatgptStatus.connected) {
                return chatgptStatus;
            }
            return { connected: false, provider: null };
        }

        async function getActive() {
            const recorded = await store.get();
            if (recorded !== undefined) {
                return recorded;
            }
            const status = await getStatus();
            return status.connected && status.planAllowed ? status.provider : undefined;
        }

        async function getProviderStatus(provider: AiProvider): Promise<AiStatus> {
            switch (provider) {
                case 'claude': {
                    const status = await claude.getStatus();
                    return status.connected ? { ...status, provider } : { connected: false, provider };
                }
                case 'chatgpt': {
                    const status = await chatgpt.getStatus();
                    return status.connected
                        ? { connected: true, provider, email: null, plan: null, planAllowed: true }
                        : { connected: false, provider };
                }
                default:
                    return assertNever(provider);
            }
        }
    },
});
