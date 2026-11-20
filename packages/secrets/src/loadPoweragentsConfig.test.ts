import { afterEach, beforeEach, expect, test } from 'bun:test';

import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

import { loadPoweragentsConfig } from './loadPoweragentsConfig.js';
import { APPLE_TEAM_ID } from './secrets.js';

const saved = { CI: process.env.CI, APPLE_TEAM_ID: process.env.APPLE_TEAM_ID };

beforeEach(() => {
    process.env.CI = 'true';
    process.env.APPLE_TEAM_ID = 'fake-team';
});

afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
});

test('resolves a secret through the container once the config is loaded (CI reads the environment only)', async () => {
    const { container } = createTestContainer();
    await loadPoweragentsConfig(container);
    expect(container.resolve(APPLE_TEAM_ID)).toBe('fake-team');
});
