import { readString } from '../../utils/readString.js';
import type { ProjectFileInput } from '../ProjectFileTypes.js';

/**
 * The project's file a request body points at, or `undefined` when it does not hold the project's id and the path as
 * strings.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseProjectFileInput(value: object): ProjectFileInput | undefined {
    const projectId = readString(value, 'projectId');
    const path = readString(value, 'path');
    return projectId === undefined || path === undefined ? undefined : { projectId, path };
}
