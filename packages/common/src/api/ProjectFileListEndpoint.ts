import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import { readString } from '../utils/readString.js';
import type { ProjectFileListInput, ProjectFileListResult } from './ProjectFileTypes.js';
import { createInputSchema } from './utils/createInputSchema.js';

const input = createInputSchema<ProjectFileListInput>('{ projectId: string, path?: string }', value => {
    const projectId = readString(value, 'projectId');
    if (projectId === undefined) {
        return undefined;
    }
    if (!('path' in value) || value.path === undefined) {
        return { projectId };
    }
    return typeof value.path === 'string' ? { projectId, path: value.path } : undefined;
});

/** The entries of one folder of a project, without its subfolders' (the app's tree opens a folder at a time). */
export const ProjectFileListEndpoint = defineEndpoint<ProjectFileListInput, ProjectFileListResult>({
    name: 'files/list',
    input,
});
