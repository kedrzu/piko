import { expect, test } from 'bun:test';

import type { SandboxStartProgress, SandboxStatus } from '@piko/common/api/SandboxTypes.js';

import { toSandboxStatus } from './toSandboxStatus.js';

const PASSWORD = 'agent-password-must-not-leave-91fa';
const PROGRESS: SandboxStartProgress = { fraction: 0.4, remainingMs: 30_000 };

test('reports a ready sandbox without its endpoint, and without progress', () => {
    const status = toSandboxStatus(
        { status: 'ready', endpoint: { url: 'http://127.0.0.1:1', username: 'opencode', password: PASSWORD } },
        PROGRESS,
    );

    const expected: SandboxStatus = { status: 'ready' };
    expect(status).toEqual(expected);
    expect(JSON.stringify(status)).not.toContain(PASSWORD);
});

test('attaches progress to a starting state only', () => {
    const building: SandboxStatus = { status: 'buildingImage', progress: PROGRESS };
    expect(toSandboxStatus({ status: 'buildingImage' }, PROGRESS)).toEqual(building);

    const unplanned: SandboxStatus = { status: 'startingVm' };
    expect(toSandboxStatus({ status: 'startingVm' }, null)).toEqual(unplanned);

    const failed: SandboxStatus = { status: 'failed', message: 'limactl start failed' };
    expect(toSandboxStatus({ status: 'failed', message: 'limactl start failed' }, PROGRESS)).toEqual(failed);
});
