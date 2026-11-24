import type { Language } from '@nzyme/i18n/Language.js';
import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { ScheduleRun } from '@piko/common/api/ScheduleTypes.js';

import * as l from './describeRunTiming.loc.js';
import { formatMomentBeside } from './formatMomentBeside.js';
import { formatScheduleMoment } from './formatScheduleMoment.js';
import { isLateRun } from './isLateRun.js';

/** What `describeRunTiming` needs. */
export interface DescribeRunTimingParams {
    run: ScheduleRun;
    /** Epoch ms of now. */
    now: number;
    language: Language;
    /**
     * Said on its own, with no day beside it (the run's header): the term says its day ("Due today 7:00 · started 9:13").
     * Otherwise (a row, whose day column shows the start's day) the start is its time alone.
     */
    standalone?: boolean;
}

/**
 * When a run was due and when it started ("Due 7:00 · started 9:13"), with the likely reason when it started late. The
 * daemon does not know the reason, so the text names the usual ones.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function describeRunTiming({ run, now, language, standalone }: DescribeRunTimingParams) {
    const params = standalone
        ? {
              due: formatScheduleMoment({ at: run.term, now, language }).dayAndTime,
              time: formatMomentBeside({ at: run.at, beside: run.term, now, language }),
          }
        : {
              due: formatMomentBeside({ at: run.term, beside: run.at, now, language }),
              time: formatScheduleMoment({ at: run.at, now, language }).time,
          };
    return translateToString(isLateRun(run) ? l.late : l.onTime, language, params);
}
