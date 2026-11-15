import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import type { ProjectFileContentResult, ProjectFileInput } from './ProjectFileTypes.js';
import { createInputSchema } from './utils/createInputSchema.js';
import { parseProjectFileInput } from './utils/parseProjectFileInput.js';

const input = createInputSchema<ProjectFileInput>('{ projectId: string, path: string }', parseProjectFileInput);

/** The bytes of any file of a project, up to 25 MiB: the app shows an image or a PDF from them when it cannot by path. */
export const ProjectFileContentEndpoint = defineEndpoint<ProjectFileInput, ProjectFileContentResult>({
    name: 'files/content',
    input,
});
