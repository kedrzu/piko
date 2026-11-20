import { defineService } from '@nzyme/ioc/Service.js';
import { secretsProvider } from '@nzyme/secrets/commands/secretsProvider.js';
import { getSecretDefinitions } from '@nzyme/secrets/getSecretDefinitions.js';

import { PikoSecretStore } from '@piko/secrets/PikoSecretStore.js';
import * as secrets from '@piko/secrets/secrets.js';

/** The provider of the `secrets` commands: the repo's declared secrets over its store. */
export const PikoSecrets = defineService({
    name: 'PikoSecrets',
    deps: { store: PikoSecretStore },
    setup: ({ store }) => secretsProvider({ secrets: getSecretDefinitions(secrets), store }),
});
