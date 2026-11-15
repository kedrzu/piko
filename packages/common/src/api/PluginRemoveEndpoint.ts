import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import type { PluginRemoveResult, PluginTargetInput } from './PluginTypes.js';
import { createInputSchema } from './utils/createInputSchema.js';
import { parsePluginTargetInput } from './utils/parsePluginTargetInput.js';

const input = createInputSchema('{ name: string, projectId?: string }', parsePluginTargetInput);

/**
 * Removes one installation of a bundled plugin: in the profile, or in the given project for a `project` plugin. Answers
 * 404 `PluginNotInstalled` when it is not installed there. An own plugin is removed by deleting its folder.
 */
export const PluginRemoveEndpoint = defineEndpoint<PluginTargetInput, PluginRemoveResult>({
    name: 'plugins/remove',
    input,
});
