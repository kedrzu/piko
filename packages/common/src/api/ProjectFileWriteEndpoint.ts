import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';

import { readString } from '../utils/readString.js';
import type { ProjectFileWriteInput, ProjectFileWriteResult } from './ProjectFileTypes.js';
import { createInputSchema } from './utils/createInputSchema.js';
import { parseProjectFileInput } from './utils/parseProjectFileInput.js';

const input = createInputSchema<ProjectFileWriteInput>(
    '{ projectId: string, path: string, content: string, version: string }',
    value => {
        const file = parseProjectFileInput(value);
        const content = readString(value, 'content');
        const version = readString(value, 'version');
        return file && content !== undefined && version !== undefined ? { ...file, content, version } : undefined;
    },
);

/**
 * Replaces the text of an existing text file of a project, unless it changed since the person's version was read. The
 * file is replaced whole at once: a reader never sees half of it.
 */
export const ProjectFileWriteEndpoint = defineEndpoint<ProjectFileWriteInput, ProjectFileWriteResult>({
    name: 'files/write',
    input,
});
