import path from 'node:path';

import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';

import { ProjectFileOpenEndpoint } from '@piko/common/api/ProjectFileOpenEndpoint.js';
import type { ProjectFileOpenResult } from '@piko/common/api/ProjectFileTypes.js';
import { isOpenableFile } from '@piko/common/utils/isOpenableFile.js';

import { OpenWithDefaultAppCommand } from '../host/OpenWithDefaultAppCommand.js';
import { ProjectFileService } from '../projects/ProjectFileService.js';

/**
 * Serves `ProjectFileOpenEndpoint`: only a path `ProjectFileService` locates in the project reaches the default app, and
 * only a document's.
 */
export const ProjectFileOpenEndpointHandler = defineEndpointHandler({
    endpoint: ProjectFileOpenEndpoint,
    deps: { files: ProjectFileService, open: OpenWithDefaultAppCommand },
    setup({ files, open }) {
        return async (input): Promise<ProjectFileOpenResult> => {
            const located = await files.locate(input);
            if ('notFound' in located) {
                return located;
            }
            if (!isOpenableFile(path.basename(located.path))) {
                return { notOpenable: true };
            }
            const result = await open({ path: located.path });
            return result === 'opened' ? { opened: true } : { unsupported: true };
        };
    },
});
