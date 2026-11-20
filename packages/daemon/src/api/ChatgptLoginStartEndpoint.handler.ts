import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { ChatgptLoginStartEndpoint } from '@piko/common/api/ChatgptLoginStartEndpoint.js';

import { ChatgptSignInService } from '../chatgpt/ChatgptSignInService.js';

/** Serves `ChatgptLoginStartEndpoint`. */
export const ChatgptLoginStartEndpointHandler = defineEndpointHandler({
    endpoint: ChatgptLoginStartEndpoint,
    deps: { chatgpt: ChatgptSignInService },
    setup({ chatgpt }) {
        return () => chatgpt.startLogin();
    },
});
