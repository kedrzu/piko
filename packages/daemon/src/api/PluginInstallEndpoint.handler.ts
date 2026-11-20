import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { PluginInstallEndpoint } from '@piko/common/api/PluginInstallEndpoint.js';

import { PluginAppInstallCommand } from '../plugins/PluginAppInstallCommand.js';

/** Serves `PluginInstallEndpoint`. */
export const PluginInstallEndpointHandler = defineEndpointHandler({
    endpoint: PluginInstallEndpoint,
    deps: { install: PluginAppInstallCommand },
    setup({ install }) {
        return input => install(input);
    },
});
