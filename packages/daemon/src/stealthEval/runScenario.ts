import { assertNever } from '@nzyme/utils/assertNever.js';

import type { EvalDriver, ScenarioStep } from './StealthEvalTypes.js';

/** What `runScenario` runs, and how. */
export interface RunScenarioParams {
    driver: EvalDriver;
    steps: ScenarioStep[];
    /** The pause before every step but the first: the agent thinks a few seconds between commands. */
    pauseMs: number;
    /** Prefixes the progress lines, e.g. the runner's name. */
    label: string;
}

/** Runs the steps one by one on the driver, printing each, with a pause between them; stops at the first failure. */
export async function runScenario(params: RunScenarioParams) {
    const { driver, steps, pauseMs, label } = params;
    for (const [index, step] of steps.entries()) {
        if (index > 0) {
            await Bun.sleep(pauseMs);
        }
        console.log(`[${label}] ${index + 1}/${steps.length} ${formatStep(step)}`);
        try {
            await runStep(driver, step);
        } catch (error) {
            throw new Error(`Step ${index + 1} (${formatStep(step)}) failed`, { cause: error });
        }
    }
}

async function runStep(driver: EvalDriver, step: ScenarioStep) {
    switch (step.kind) {
        case 'open':
            return driver.open(step.url);
        case 'click':
            return driver.click(step.selector);
        case 'type':
            return driver.type(step.selector, step.text);
        case 'press':
            return driver.press(step.key);
        case 'select':
            return driver.select(step.selector, step.value);
        case 'pickDate':
            return driver.pickDate(step.selector, step.date);
        case 'scrollBy':
            return driver.scrollBy(step.px);
        case 'scrollTo':
            return driver.scrollTo(step.selector);
        case 'wait':
            return Bun.sleep(step.ms);
        default:
            return assertNever(step);
    }
}

function formatStep(step: ScenarioStep) {
    switch (step.kind) {
        case 'open':
            return `open ${step.url}`;
        case 'click':
            return `click ${step.selector}`;
        case 'type':
            return `type into ${step.selector}`;
        case 'press':
            return `press ${step.key}`;
        case 'select':
            return `select ${step.value} in ${step.selector}`;
        case 'pickDate':
            return `pick ${step.date} in ${step.selector}`;
        case 'scrollBy':
            return `scroll by ${step.px} px`;
        case 'scrollTo':
            return `scroll to ${step.selector}`;
        case 'wait':
            return `wait ${step.ms} ms`;
        default:
            return assertNever(step);
    }
}
