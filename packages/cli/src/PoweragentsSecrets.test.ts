import { expect, test } from 'bun:test';

import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { isSecretEnabled } from '@nzyme/secrets/defineSecret.js';

import { PoweragentsSecrets } from './PoweragentsSecrets.js';

function storeIdFor(env: Record<string, string>): string {
    const { container } = createTestContainer();
    container.set(EnvVariables, env);
    const [store] = container.resolve(PoweragentsSecrets).stores;
    return store?.id ?? '';
}

test('reads the dev prefix by default, so that bun run dev never reaches the signing keys', () => {
    expect(storeIdFor({})).not.toContain('POWERAGENTS_PROD_');
    expect(storeIdFor({ POWERAGENTS_ENV: 'dev' })).toContain('POWERAGENTS_DEV_');
});

test('reads the prod prefix in prod', () => {
    expect(storeIdFor({ POWERAGENTS_ENV: 'prod' })).toContain('POWERAGENTS_PROD_');
});

test('declares the signing secrets for prod only', () => {
    const { container } = createTestContainer();
    const { secrets = [] } = container.resolve(PoweragentsSecrets);
    expect(secrets.map(secret => secret.name)).toContain('TAURI_SIGNING_PRIVATE_KEY');
    expect(secrets.every(secret => isSecretEnabled(secret, { POWERAGENTS_ENV: 'prod' }))).toBe(true);
    expect(secrets.some(secret => isSecretEnabled(secret, {}))).toBe(false);
    expect(secrets.some(secret => isSecretEnabled(secret, { POWERAGENTS_ENV: 'dev' }))).toBe(false);
});
