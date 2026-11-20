import { bitwarden } from '@nzyme/bitwarden/bitwarden.js';
import { defineEnvVariable } from '@nzyme/ioc/defineEnvVariable.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { cached } from '@nzyme/secrets/cached.js';

const PROJECT_ID = '41fe22b4-53d3-4302-b97b-b4f601003c79';
/** Keeps this repo's login apart from the other repos' on this machine. */
const KEYCHAIN_SUFFIX = 'poweragents';
const CACHE_TTL_MS = 8 * 60 * 60 * 1000;

/** The environment, `dev` or `prod`: it picks the store's prefix, so `prod` secrets are out of reach in `dev`. */
export const POWERAGENTS_ENV = defineEnvVariable('POWERAGENTS_ENV', { default: 'dev' });

/**
 * The store of the repo's secrets. The signing secrets of a release (`./secrets.ts`) live under the prefix
 * `POWERAGENTS_PROD_`, and the store reads only that prefix under `POWERAGENTS_ENV=prod`; `dev` (the default) reads
 * `POWERAGENTS_DEV_`, which holds none. The Bitwarden project is shared with other repos, so this repo's keys carry
 * the prefix `POWERAGENTS_`.
 */
export const PoweragentsSecretStore = defineService({
    name: 'PoweragentsSecretStore',
    deps: { env: POWERAGENTS_ENV },
    setup: ({ env }) =>
        cached(
            bitwarden({
                project: PROJECT_ID,
                prefix: `POWERAGENTS_${env.toUpperCase()}_`,
                keychainSuffix: KEYCHAIN_SUFFIX,
            }),
            { ttl: CACHE_TTL_MS },
        ),
});
