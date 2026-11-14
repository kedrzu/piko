import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { ChatgptLoginCancelEndpoint } from '@poweragents/common/api/ChatgptLoginCancelEndpoint.js';

import { ChatgptSignInService } from '../chatgpt/ChatgptSignInService.js';

/** Serves `ChatgptLoginCancelEndpoint`. */
export const ChatgptLoginCancelEndpointHandler = defineEndpointHandler({
    endpoint: ChatgptLoginCancelEndpoint,
    deps: { chatgpt: ChatgptSignInService },
    setup({ chatgpt }) {
        return () => chatgpt.cancelLogin();
    },
});
