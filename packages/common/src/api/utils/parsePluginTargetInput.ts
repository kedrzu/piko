import { readString } from '../../utils/readString.js';
import type { PluginTargetInput } from '../PluginTypes.js';

/**
 * The plugin a request body points at, or `undefined` when its name is not a string or a `projectId` it holds is not
 * one.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parsePluginTargetInput(value: object): PluginTargetInput | undefined {
    const name = readString(value, 'name');
    const projectId = readString(value, 'projectId');
    if (name === undefined || ('projectId' in value && projectId === undefined)) {
        return undefined;
    }
    return projectId === undefined ? { name } : { name, projectId };
}
