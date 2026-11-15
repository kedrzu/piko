import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { ProjectFileContentEndpoint } from '@poweragents/common/api/ProjectFileContentEndpoint.js';

import { ProjectFileService } from '../projects/ProjectFileService.js';

/** Serves `ProjectFileContentEndpoint`. */
export const ProjectFileContentEndpointHandler = defineEndpointHandler({
    endpoint: ProjectFileContentEndpoint,
    deps: { files: ProjectFileService },
    setup({ files }) {
        return input => files.content(input);
    },
});
