import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

/** Ends the waiting ChatGPT sign-in, if any, and closes its port; also while the sandbox is not ready. */
export const ChatgptLoginCancelEndpoint = defineEndpoint({ name: 'chatgpt/login/cancel' });
