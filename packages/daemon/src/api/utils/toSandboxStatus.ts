import { assertNever } from '@nzyme/utils/assertNever.js';

import type { SandboxStartProgress, SandboxStatus } from '@piko/common/api/SandboxTypes.js';

import type { SandboxState } from '../../sandbox/Sandbox.js';

/**
 * The sandbox's state as the API reports it: without the agent's endpoint, whose password must never leave the daemon.
 * `progress` is attached to a starting state only.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function toSandboxStatus(state: SandboxState, progress: SandboxStartProgress | null): SandboxStatus {
    switch (state.status) {
        case 'ready':
            return { status: 'ready' };
        case 'failed':
            return { status: 'failed', message: state.message };
        case 'startingVm':
        case 'buildingImage':
        case 'startingAgent':
            return progress ? { status: state.status, progress } : { status: state.status };
        case 'stopped':
        case 'stopping':
            return { status: state.status };
        default:
            return assertNever(state);
    }
}
