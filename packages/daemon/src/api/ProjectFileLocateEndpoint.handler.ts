import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { ProjectFileLocateEndpoint } from '@poweragents/common/api/ProjectFileLocateEndpoint.js';

import { ProjectFileService } from '../projects/ProjectFileService.js';

/** Serves `ProjectFileLocateEndpoint`. */
export const ProjectFileLocateEndpointHandler = defineEndpointHandler({
    endpoint: ProjectFileLocateEndpoint,
    deps: { files: ProjectFileService },
    setup({ files }) {
        return input => files.locate(input);
    },
});
