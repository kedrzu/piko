import { HttpError } from '@nzyme/fetch-utils/HttpError.js';
import { useLogger } from '@nzyme/vue-ioc/useLogger.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { shallowReactive } from 'vue';

import type { Schedule, ScheduleRef } from '@piko/common/api/ScheduleTypes.js';

import { ScheduleStore } from './ScheduleStore.js';

/** What became of a pause or a resume: `gone` when the schedule no longer exists. */
export type SchedulePausingResult = 'saved' | 'gone' | 'failed';

/**
 * A schedule's switch: it shows what the person asked for while the daemon saves it, then what the daemon holds, so a
 * failed pause or resume shows the real state again.
 */
export function useSchedulePausing() {
    const store = useService(ScheduleStore);
    const logger = useLogger();
    /** What the person asked for, by schedule, while it is being saved. */
    const asked = shallowReactive(new Map<string, boolean>());

    return { pausedOf, setPaused };

    /** Whether the switch shows the schedule paused. */
    function pausedOf(schedule: Schedule) {
        return asked.get(toKey({ projectId: schedule.projectId, scheduleId: schedule.id })) ?? schedule.paused;
    }

    /** Pauses (`true`) or resumes the schedule. */
    async function setPaused(schedule: ScheduleRef, paused: boolean): Promise<SchedulePausingResult> {
        const key = toKey(schedule);
        asked.set(key, paused);
        try {
            await store.update({ projectId: schedule.projectId, scheduleId: schedule.scheduleId, paused });
            return 'saved';
        } catch (error) {
            if (error instanceof HttpError && error.status === 404) {
                return 'gone';
            }
            logger.warn('Schedule could not be paused or resumed', { ...schedule, paused, error });
            return 'failed';
        } finally {
            asked.delete(key);
        }
    }
}

function toKey(schedule: ScheduleRef) {
    return JSON.stringify([schedule.projectId, schedule.scheduleId]);
}
