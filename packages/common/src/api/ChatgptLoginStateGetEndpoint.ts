import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import type { ChatgptLoginState } from './ChatgptTypes.js';

/** Where the ChatGPT sign-in stands; the app polls it while the person signs in in the browser. */
export const ChatgptLoginStateGetEndpoint = defineEndpoint<void, ChatgptLoginState>({ name: 'chatgpt/login/state' });
