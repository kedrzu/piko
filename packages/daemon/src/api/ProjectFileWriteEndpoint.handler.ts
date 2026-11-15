import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { ProjectFileWriteEndpoint } from '@poweragents/common/api/ProjectFileWriteEndpoint.js';

import { ProjectFileService } from '../projects/ProjectFileService.js';

/** Serves `ProjectFileWriteEndpoint`. */
export const ProjectFileWriteEndpointHandler = defineEndpointHandler({
    endpoint: ProjectFileWriteEndpoint,
    deps: { files: ProjectFileService },
    setup({ files }) {
        return input => files.write(input);
    },
});
