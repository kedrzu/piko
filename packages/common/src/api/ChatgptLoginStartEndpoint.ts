import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import type { ChatgptLoginStartResult } from './ChatgptTypes.js';

/**
 * Starts a ChatGPT sign-in and returns its page. Always a new sign-in: one already waiting is ended, so "open again"
 * should reopen the URL it has rather than call this. Answers 409 (`SandboxNotReady`) while the sandbox is not ready, as
 * `chatgpt/login/state` does.
 */
export const ChatgptLoginStartEndpoint = defineEndpoint<void, ChatgptLoginStartResult>({ name: 'chatgpt/login/start' });
