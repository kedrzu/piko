import type { ScheduleRun } from '@piko/common/api/ScheduleTypes.js';

/** Past this long after its term, a run ran late: the computer slept, piko was closed or the sandbox was starting. */
const LATE_AFTER_MS = 5 * 60_000;

/**
 * Whether a run was handled well after its term. The daemon does not know why; the screens say the likely reasons.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function isLateRun(run: ScheduleRun) {
    return run.at - run.term > LATE_AFTER_MS;
}
