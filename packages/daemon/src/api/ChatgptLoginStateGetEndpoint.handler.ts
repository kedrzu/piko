import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { ChatgptLoginStateGetEndpoint } from '@poweragents/common/api/ChatgptLoginStateGetEndpoint.js';

import { ChatgptSignInService } from '../chatgpt/ChatgptSignInService.js';

/** Serves `ChatgptLoginStateGetEndpoint`. */
export const ChatgptLoginStateGetEndpointHandler = defineEndpointHandler({
    endpoint: ChatgptLoginStateGetEndpoint,
    deps: { chatgpt: ChatgptSignInService },
    setup({ chatgpt }) {
        return () => chatgpt.getLoginState();
    },
});
