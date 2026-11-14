import type { AiProvider } from '@poweragents/common/api/AiTypes.js';

import { CHATGPT_INTEGRATION } from '../../chatgpt/ChatgptSignInService.js';
import { CLAUDE_INTEGRATION } from '../../claude/ClaudeSignInService.js';

/**
 * The provider of an OpenCode model provider (a session's `providerId`); `undefined` for one the app does not run the
 * agent on, or none.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function toAiProvider(providerId: string | undefined): AiProvider | undefined {
    switch (providerId) {
        case CLAUDE_INTEGRATION:
            return 'claude';
        case CHATGPT_INTEGRATION:
            return 'chatgpt';
        default:
            return undefined;
    }
}
