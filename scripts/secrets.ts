/**
 * The repo's secrets: the store, and the `secrets` commands of the `nzyme` binary (`bun nzyme secrets …`, a plugin
 * listed in the root `package.json`).
 */
import { bitwarden } from '@nzyme/bitwarden/bitwarden.js';
import type { NzymePlugin } from '@nzyme/cli-core/NzymePlugin.js';
import { defineEnvVariable } from '@nzyme/ioc/defineEnvVariable.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { cached } from '@nzyme/secrets/cached.js';
import { defineSecretsCommands } from '@nzyme/secrets/commands/defineSecretsCommands.js';
import type { SecretsProvider } from '@nzyme/secrets/commands/SecretsCommandsOptions.js';

const PROJECT_ID = '41fe22b4-53d3-4302-b97b-b4f601003c79';
/** Keeps this repo's login apart from the other repos' on this machine. */
const KEYCHAIN_SUFFIX = 'poweragents';
const CACHE_TTL_MS = 8 * 60 * 60 * 1000;

/** The environment, `dev` or `prod`: it picks the store's prefix, so `prod` secrets are out of reach in `dev`. */
const POWERAGENTS_ENV = defineEnvVariable('POWERAGENTS_ENV', { default: 'dev' });

/**
 * The signing secrets of a release (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `APPLE_*`)
 * live under the prefix `POWERAGENTS_PROD_`, and the store reads only that prefix under `POWERAGENTS_ENV=prod`; `dev`
 * (the default) reads `POWERAGENTS_DEV_`, which holds none, so `bun run dev` never holds what signs updates and the
 * app. The Bitwarden project is shared with other repos, so this repo's keys carry the prefix `POWERAGENTS_`.
 */
export const PoweragentsSecrets = defineService({
    name: 'PoweragentsSecrets',
    deps: { env: POWERAGENTS_ENV },
    setup({ env }): SecretsProvider {
        const store = cached(
            bitwarden({
                project: PROJECT_ID,
                prefix: `POWERAGENTS_${env.toUpperCase()}_`,
                keychainSuffix: KEYCHAIN_SUFFIX,
            }),
            { ttl: CACHE_TTL_MS },
        );
        return { stores: [store], target: () => store };
    },
});

export default { commands: defineSecretsCommands({ provider: PoweragentsSecrets }) } satisfies NzymePlugin;
