import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { ProjectFileListEndpoint } from '@poweragents/common/api/ProjectFileListEndpoint.js';

import { ProjectFileService } from '../projects/ProjectFileService.js';

/** Serves `ProjectFileListEndpoint`. */
export const ProjectFileListEndpointHandler = defineEndpointHandler({
    endpoint: ProjectFileListEndpoint,
    deps: { files: ProjectFileService },
    setup({ files }) {
        return input => files.list(input);
    },
});
