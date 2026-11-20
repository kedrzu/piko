import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { ProjectFileReadEndpoint } from '@piko/common/api/ProjectFileReadEndpoint.js';

import { ProjectFileService } from '../projects/ProjectFileService.js';

/** Serves `ProjectFileReadEndpoint`. */
export const ProjectFileReadEndpointHandler = defineEndpointHandler({
    endpoint: ProjectFileReadEndpoint,
    deps: { files: ProjectFileService },
    setup({ files }) {
        return input => files.read(input);
    },
});
