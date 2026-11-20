#!/usr/bin/env -S bun --conditions=source
/**
 * The repo's CLI, run as `bun poweragents …` from the root: the secrets and the pen design file commands.
 */
import { execute } from '@nzyme/cli-core/execute.js';
import { definePenCommands } from '@nzyme/pen/definePenCommands.js';
import { defineSecretsCommands } from '@nzyme/secrets/commands/defineSecretsCommands.js';

import { PoweragentsSecrets } from './PoweragentsSecrets.js';

await execute({
    name: 'poweragents',
    commands: [...defineSecretsCommands({ provider: PoweragentsSecrets }), ...definePenCommands()],
});
