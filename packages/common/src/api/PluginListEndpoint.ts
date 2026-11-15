import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import type { PluginInfo } from './PluginTypes.js';

/** Every plugin, bundled and own, with where it is installed and what is wrong with it. */
export const PluginListEndpoint = defineEndpoint<void, PluginInfo[]>({ name: 'plugins/list' });
