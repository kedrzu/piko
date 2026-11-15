import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import type { ProjectFileInput, ProjectFileOpenResult } from './ProjectFileTypes.js';
import { createInputSchema } from './utils/createInputSchema.js';
import { parseProjectFileInput } from './utils/parseProjectFileInput.js';

const input = createInputSchema<ProjectFileInput>('{ projectId: string, path: string }', parseProjectFileInput);

/**
 * Opens a project's file in the app the computer opens it with by default, on the computer the daemon runs on. Only a
 * file found like a read is opened, and only a document (`isOpenableFile`).
 */
export const ProjectFileOpenEndpoint = defineEndpoint<ProjectFileInput, ProjectFileOpenResult>({
    name: 'files/open',
    input,
});
