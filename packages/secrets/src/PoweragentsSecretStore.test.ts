import { expect, test } from 'bun:test';

import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { getSecretDefinitions } from '@nzyme/secrets/getSecretDefinitions.js';
import { isSecretEnabled } from '@nzyme/secrets/defineSecret.js';

import { PoweragentsSecretStore } from './PoweragentsSecretStore.js';
import * as secrets from './secrets.js';

function storeIdFor(env: Record<string, string>): string {
    const { container } = createTestContainer();
    container.set(EnvVariables, env);
    return container.resolve(PoweragentsSecretStore).id;
}

test('reads the dev prefix by default, so that bun run dev never reaches the signing keys', () => {
    expect(storeIdFor({})).not.toContain('POWERAGENTS_PROD_');
    expect(storeIdFor({ POWERAGENTS_ENV: 'dev' })).toContain('POWERAGENTS_DEV_');
});

test('reads the prod prefix in prod', () => {
    expect(storeIdFor({ POWERAGENTS_ENV: 'prod' })).toContain('POWERAGENTS_PROD_');
});

test('declares the signing secrets for prod only', () => {
    const definitions = getSecretDefinitions(secrets);
    expect(definitions.map(secret => secret.name)).toContain('TAURI_SIGNING_PRIVATE_KEY');
    expect(definitions.every(secret => isSecretEnabled(secret, { POWERAGENTS_ENV: 'prod' }))).toBe(true);
    expect(definitions.some(secret => isSecretEnabled(secret, {}))).toBe(false);
    expect(definitions.some(secret => isSecretEnabled(secret, { POWERAGENTS_ENV: 'dev' }))).toBe(false);
});
