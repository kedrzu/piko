import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { ProjectFileReleaseEndpoint } from '@poweragents/common/api/ProjectFileReleaseEndpoint.js';

import { FileHoldService } from '../files/FileHoldService.js';

/** Serves `ProjectFileReleaseEndpoint`. */
export const ProjectFileReleaseEndpointHandler = defineEndpointHandler({
    endpoint: ProjectFileReleaseEndpoint,
    deps: { holds: FileHoldService },
    setup({ holds }) {
        return async input => ({ released: await holds.release({ projectId: input.projectId, path: input.path }) });
    },
});
