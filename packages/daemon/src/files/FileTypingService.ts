import { defineService } from '@nzyme/ioc/Service.js';

import { Clock } from '../utils/Clock.js';
import type { ProjectFileRef } from './FileAgentStateService.js';
import { toFileKey } from './toFileKey.js';

/**
 * When the person last saved each project file from the app: her typing, as the daemon sees it (the app saves a second
 * after a change and every few seconds while she types). Opening or reading a file records nothing.
 */
export interface FileTypingServiceShape {
    /** The person saved `file` now. */
    noteWrite(file: ProjectFileRef): void;
    /** When the person last saved `file`, in ms since the epoch; `undefined` when never or forgotten. */
    lastWrite(file: ProjectFileRef): number | undefined;
    /** Forgets the person's saves of `file`, as if she never typed in it. */
    forget(file: ProjectFileRef): void;
}

/** The person's saves of project files. */
export const FileTypingService = defineService({
    name: 'FileTypingService',
    deps: { clock: Clock },
    setup({ clock }): FileTypingServiceShape {
        /** By `projectId\0path`. */
        const writes = new Map<string, number>();

        return { noteWrite, lastWrite, forget };

        function noteWrite(file: ProjectFileRef) {
            writes.set(toFileKey(file), clock.now());
        }

        function lastWrite(file: ProjectFileRef) {
            return writes.get(toFileKey(file));
        }

        function forget(file: ProjectFileRef) {
            writes.delete(toFileKey(file));
        }
    },
});
