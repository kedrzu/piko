import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { ConversationStopEndpoint } from '@piko/common/api/ConversationStopEndpoint.js';

import { ConversationService } from '../conversations/ConversationService.js';

/** Serves `ConversationStopEndpoint`. */
export const ConversationStopEndpointHandler = defineEndpointHandler({
    endpoint: ConversationStopEndpoint,
    deps: { conversations: ConversationService },
    setup({ conversations }) {
        return input => conversations.stop(input);
    },
});
