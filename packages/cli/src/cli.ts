#!/usr/bin/env -S bun --conditions=source
/**
 * The repo's CLI, run as `bun piko …` from the root: the secrets and the pen design file commands.
 */
import { execute } from '@nzyme/cli-core/execute.js';
import { definePenCommands } from '@nzyme/pen/definePenCommands.js';
import { defineSecretsCommands } from '@nzyme/secrets/commands/defineSecretsCommands.js';

import { PikoSecrets } from './PikoSecrets.js';

await execute({
    name: 'piko',
    commands: [...defineSecretsCommands({ provider: PikoSecrets }), ...definePenCommands()],
});
