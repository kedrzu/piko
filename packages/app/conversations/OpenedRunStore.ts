import { defineService } from '@nzyme/ioc/Service.js';
import { shallowRef } from 'vue';

import { parseStoredIds } from '@/utils/parseStoredIds.js';

/** Where the ids of the scheduled runs the person opened are kept, oldest first. */
const OPENED_RUNS_KEY = 'piko.openedRuns';
/** How many opened runs are remembered: the newest, enough for every sidebar a project shows. */
const MAX_OPENED_RUNS = 500;

/**
 * The scheduled runs the person opened, remembered across restarts: the sidebar lists them beside the conversations she
 * started, while the runs she never opened stay in the project's history (`docs/design/piko/DECISIONS.md`, D33).
 */
export const OpenedRunStore = defineService({
    name: 'OpenedRunStore',
    setup() {
        /** Oldest first. */
        const opened = shallowRef<readonly string[]>(parseStoredIds(localStorage.getItem(OPENED_RUNS_KEY)) ?? []);

        return { isOpened, markOpened };

        /** Whether the person opened this run. */
        function isOpened(conversationId: string) {
            return opened.value.includes(conversationId);
        }

        /** Remembers that the person opened a run; the oldest are forgotten past the newest {@link MAX_OPENED_RUNS}. */
        function markOpened(conversationId: string) {
            if (opened.value.at(-1) === conversationId) {
                return;
            }
            const next = [...opened.value.filter(id => id !== conversationId), conversationId].slice(-MAX_OPENED_RUNS);
            opened.value = next;
            localStorage.setItem(OPENED_RUNS_KEY, JSON.stringify(next));
        }
    },
});
