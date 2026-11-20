import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { PluginRemoveEndpoint } from '@piko/common/api/PluginRemoveEndpoint.js';

import { PluginService } from '../plugins/PluginService.js';

/** Serves `PluginRemoveEndpoint`. */
export const PluginRemoveEndpointHandler = defineEndpointHandler({
    endpoint: PluginRemoveEndpoint,
    deps: { plugins: PluginService },
    setup({ plugins }) {
        return async input => {
            await plugins.remove(input);
            return {};
        };
    },
});
