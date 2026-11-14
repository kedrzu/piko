import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

/** The fields of a CDP `TargetInfo` the daemon reads. */
export interface TargetInfoFields {
    targetId: string;
    type: string;
    /** The page that opened this one: set for a popup. */
    openerId?: string;
}

/**
 * Reads `targetInfo` from the parameters of a `Target.*` event (`targetCreated`, `attachedToTarget`, …); `null` when it
 * is missing or malformed.
 * @__NO_SIDE_EFFECTS__
 */
export function readTargetInfo(params: unknown): TargetInfoFields | null {
    const info = isPlainObject(params) ? params['targetInfo'] : undefined;
    if (!isPlainObject(info) || typeof info['targetId'] !== 'string' || typeof info['type'] !== 'string') {
        return null;
    }
    const openerId = info['openerId'];
    return {
        targetId: info['targetId'],
        type: info['type'],
        openerId: typeof openerId === 'string' ? openerId : undefined,
    };
}
