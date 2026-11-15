import type { ProjectFileRef } from './FileAgentStateService.js';

/**
 * One string per project file, for a `Map` or `Set` key.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function toFileKey(file: ProjectFileRef) {
    return `${file.projectId}\0${file.path}`;
}
