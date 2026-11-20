import { defineService } from '@nzyme/ioc/Service.js';
import { secretsProvider } from '@nzyme/secrets/commands/secretsProvider.js';
import { getSecretDefinitions } from '@nzyme/secrets/getSecretDefinitions.js';

import { PoweragentsSecretStore } from '@poweragents/secrets/PoweragentsSecretStore.js';
import * as secrets from '@poweragents/secrets/secrets.js';

/** The provider of the `secrets` commands: the repo's declared secrets over its store. */
export const PoweragentsSecrets = defineService({
    name: 'PoweragentsSecrets',
    deps: { store: PoweragentsSecretStore },
    setup: ({ store }) => secretsProvider({ secrets: getSecretDefinitions(secrets), store }),
});
