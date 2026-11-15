import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import type { ProjectFileInput, ProjectFileReadResult } from './ProjectFileTypes.js';
import { createInputSchema } from './utils/createInputSchema.js';
import { parseProjectFileInput } from './utils/parseProjectFileInput.js';

const input = createInputSchema<ProjectFileInput>('{ projectId: string, path: string }', parseProjectFileInput);

/** One file of a project: its text when it is a text file, otherwise only its size: the app shows it by its content or location. */
export const ProjectFileReadEndpoint = defineEndpoint<ProjectFileInput, ProjectFileReadResult>({
    name: 'files/read',
    input,
});
