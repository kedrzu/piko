import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { SandboxStatusGetEndpoint } from '@piko/common/api/SandboxStatusGetEndpoint.js';

import { Sandbox } from '../sandbox/Sandbox.js';
import { toSandboxStatus } from './utils/toSandboxStatus.js';

/** Serves `SandboxStatusGetEndpoint`. */
export const SandboxStatusGetEndpointHandler = defineEndpointHandler({
    endpoint: SandboxStatusGetEndpoint,
    deps: { sandbox: Sandbox },
    setup({ sandbox }) {
        return async () => {
            const state = await sandbox.getVerifiedState();
            return toSandboxStatus(state, sandbox.getStartProgress());
        };
    },
});
