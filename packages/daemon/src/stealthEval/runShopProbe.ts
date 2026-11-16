import { waitUntil } from '@nzyme/utils/waitUntil.js';

import { parseShopVisit } from './parseShopVisit.js';
import { runScenario } from './runScenario.js';
import { createShopScenario } from './shopScenario.js';
import type { EvalDriver, ShopVisit } from './StealthEvalTypes.js';

/** How `runShopProbe` runs. */
export interface RunShopProbeParams {
    driver: EvalDriver;
    pauseMs: number;
    label: string;
}

/** How long the last actions' tokens and assessments get once the visit is over. */
const SCORES_TIMEOUT_MS = 120_000;
const SCORES_POLL_MS = 2000;
const READ_RESULTS = "JSON.parse(document.getElementById('eval-results').textContent)";

/**
 * The reCAPTCHA probe (stealth-browsing D11): makes the shop visit on the driver, then waits until every action has a score or an
 * error and returns the visit as the shop recorded it. On timeout it returns what is there, pending actions included.
 */
export async function runShopProbe(params: RunShopProbeParams): Promise<ShopVisit> {
    const { driver, pauseMs, label } = params;
    const startedAt = new Date();
    await runScenario({ driver, steps: createShopScenario(startedAt), pauseMs, label });

    let visit = await readVisit();
    // A tab of its own starts a fresh visit (the shop keeps it in sessionStorage); an older one would mix in another run.
    if (Date.parse(visit.startedAt) < startedAt.getTime()) {
        throw new Error('The shop visit started before this run: the tab carried an older visit');
    }
    await waitUntil(
        async () => {
            visit = await readVisit();
            return visit.actions.every(action => action.score != null || action.error != null);
        },
        {
            intervalMs: SCORES_POLL_MS,
            timeoutMs: SCORES_TIMEOUT_MS,
            onTimeout: () => console.warn(`[${label}] some shop actions are still pending, saving them as they are`),
        },
    );
    return visit;

    async function readVisit() {
        return parseShopVisit(await driver.evaluate(READ_RESULTS));
    }
}
