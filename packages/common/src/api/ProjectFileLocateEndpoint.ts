import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import type { ProjectFileInput, ProjectFileLocateResult } from './ProjectFileTypes.js';
import { createInputSchema } from './utils/createInputSchema.js';
import { parseProjectFileInput } from './utils/parseProjectFileInput.js';

const input = createInputSchema<ProjectFileInput>('{ projectId: string, path: string }', parseProjectFileInput);

/** The absolute path of a project's file, checked like a read: the desktop app shows the file from it. */
export const ProjectFileLocateEndpoint = defineEndpoint<ProjectFileInput, ProjectFileLocateResult>({
    name: 'files/locate',
    input,
});
