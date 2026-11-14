import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import type { AiStatus } from './AiTypes.js';

/**
 * The active AI provider's sign-in in the sandbox. Answers 409 (`SandboxNotReady`) while the sandbox is not ready, as
 * every sign-in endpoint does.
 */
export const AiStatusGetEndpoint = defineEndpoint<void, AiStatus>({ name: 'ai/status' });
