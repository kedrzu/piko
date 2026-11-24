import type { Language } from '@nzyme/i18n/Language.js';

import { formatScheduleMoment } from './formatScheduleMoment.js';

/** What `formatMomentBeside` needs. */
export interface FormatMomentBesideParams {
    /** Epoch ms of the moment to say. */
    at: number;
    /** Epoch ms of the moment it is said beside, whose day the reader already sees. */
    beside: number;
    /** Epoch ms of now. */
    now: number;
    language: Language;
}

/**
 * A moment said beside another, in the words of `formatScheduleMoment`: its time alone on the other's day ("7:00"),
 * with its day otherwise ("yesterday 23:00").
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function formatMomentBeside({ at, beside, now, language }: FormatMomentBesideParams) {
    const said = formatScheduleMoment({ at, now, language });
    return said.day === formatScheduleMoment({ at: beside, now, language }).day ? said.time : said.dayAndTime;
}
