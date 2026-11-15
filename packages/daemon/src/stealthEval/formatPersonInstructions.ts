import { assertNever } from '@nzyme/utils/assertNever.js';

import type { ScenarioStep } from './StealthEvalTypes.js';

/**
 * The scenario as numbered instructions in Polish for the person, who runs it by hand in their own Chrome; one line per
 * step, so they do exactly what the drivers do.
 * @__NO_SIDE_EFFECTS__
 */
export function formatPersonInstructions(steps: ScenarioStep[]): string[] {
    return steps.map((step, index) => `${index + 1}. ${step.instruction ?? describeStep(step)}`);
}

function describeStep(step: ScenarioStep) {
    switch (step.kind) {
        case 'open':
            return `Otwórz nową kartę w swoim zwykłym Chrome i wejdź na ${step.url}`;
        case 'click':
            return `Kliknij ${step.label}.`;
        case 'type':
            return `Wpisz „${step.text}” w ${step.label}.`;
        case 'press':
            return `Naciśnij ${step.key}.`;
        case 'select':
            return `W ${step.label} wybierz „${step.value}”.`;
        case 'pickDate':
            return `W ${step.label} wybierz datę ${step.date}.`;
        case 'scrollBy':
            return 'Przewiń stronę trochę w dół, czytając.';
        case 'scrollTo':
            return `Przewiń do ${step.label}.`;
        case 'wait':
            return `Odczekaj ${Math.round(step.ms / 1000)} s.`;
        default:
            return assertNever(step);
    }
}
