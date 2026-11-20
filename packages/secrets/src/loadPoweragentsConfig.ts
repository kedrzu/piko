import { envSource } from '@nzyme/config/envSource.js';
import { loadConfig } from '@nzyme/config/loadConfig.js';
import type { Container } from '@nzyme/ioc/Container.js';
import { secretsSource } from '@nzyme/secrets/secretsSource.js';

import { PoweragentsSecretStore } from './PoweragentsSecretStore.js';

/**
 * Installs the secrets into the container's config document, so that code resolves them through the container
 * (`container.resolve(TAURI_SIGNING_PRIVATE_KEY)`) and never reads `process.env`. An environment variable wins over
 * the store; in CI the job's environment carries the values and the store is not read.
 */
export function loadPoweragentsConfig(container: Container): Promise<void> {
    return loadConfig(
        container,
        process.env.CI ? [envSource()] : [envSource(), secretsSource(container.resolve(PoweragentsSecretStore))],
    );
}
