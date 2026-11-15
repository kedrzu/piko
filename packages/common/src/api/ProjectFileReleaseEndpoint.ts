import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import type { ProjectFileInput, ProjectFileReleaseResult } from './ProjectFileTypes.js';
import { createInputSchema } from './utils/createInputSchema.js';
import { parseProjectFileInput } from './utils/parseProjectFileInput.js';

const input = createInputSchema<ProjectFileInput>('{ projectId: string, path: string }', parseProjectFileInput);

/**
 * Lets the agent write a project file now: a change it holds because the person was typing in the file goes ahead,
 * and her recent saves of it no longer hold the next one. Sent when she asks, and when she closes the file.
 */
export const ProjectFileReleaseEndpoint = defineEndpoint<ProjectFileInput, ProjectFileReleaseResult>({
    name: 'files/release',
    input,
});
