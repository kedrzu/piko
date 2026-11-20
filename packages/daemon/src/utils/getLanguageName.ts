import { assertNever } from '@nzyme/utils/assertNever.js';

import type { AppLanguage } from '@piko/common/appLanguages.js';

/**
 * An app language's English name, for the instructions the daemon gives the agent (`Polish`, `English`).
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function getLanguageName(language: AppLanguage) {
    switch (language) {
        case 'pl':
            return 'Polish';
        case 'en':
            return 'English';
        default:
            return assertNever(language);
    }
}
