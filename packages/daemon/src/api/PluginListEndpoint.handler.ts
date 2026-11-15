import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { PluginListEndpoint } from '@poweragents/common/api/PluginListEndpoint.js';

import { PluginService } from '../plugins/PluginService.js';

/** Serves `PluginListEndpoint`. */
export const PluginListEndpointHandler = defineEndpointHandler({
    endpoint: PluginListEndpoint,
    deps: { plugins: PluginService },
    setup({ plugins }) {
        return () => plugins.list();
    },
});
