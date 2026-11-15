import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

import { bootBrowserStack } from './bootBrowserStack.js';
import { createAgentBrowserDriver } from './createAgentBrowserDriver.js';
import { createPlaywrightDriver } from './createPlaywrightDriver.js';
import { formatComparison } from './formatComparison.js';
import { formatPersonInstructions } from './formatPersonInstructions.js';
import { installAgentBrowser } from './installAgentBrowser.js';
import { parseShopVisit } from './parseShopVisit.js';
import { loadLatestRunResults, saveRunResult } from './runResultFiles.js';
import { runShopProbe } from './runShopProbe.js';
import { createShopScenario, SHOP_URL } from './shopScenario.js';
import type { EvalDriver, RunProbes, RunResult } from './StealthEvalTypes.js';

// `bun run stealth:eval <command>`: measures how detectable the agent's browser is (design `docs/design/stealth-browsing`,
// D6, D9, D11). `run` drives the shop visit with the agent's own browser (the daemon's browser stack and agent-browser)
// and with a plain headless Chromium; `person` takes the same visit made by hand; `compare` prints the latest run of
// each runner side by side. Everything it keeps lives in its own state folder, never in the person's poweragents state.

const STATE_FOLDER = path.join(os.homedir(), '.poweragents-stealth-eval');
const RESULTS_FOLDER = path.join(STATE_FOLDER, 'results');
const DEFAULT_PAUSE_MS = 3000;
/** How long the cleanup on Ctrl-C may take before the process exits anyway. */
const INTERRUPT_CLEANUP_MS = 15_000;
const USAGE = `Usage: bun run stealth:eval <command>
  run [--runner agent|headless|all] [--pause <ms>]   drive the shop visit (default: all, ${DEFAULT_PAUSE_MS} ms between steps)
  person                                             make the visit by hand and paste its results
  compare                                            print the latest run of each runner`;

/** What a run must undo when it ends or is interrupted, last first. */
const cleanups: (() => Promise<void>)[] = [];

process.on('SIGINT', () => void interrupt());

let exitCode = 0;
try {
    await main(process.argv.slice(2));
} catch (error) {
    printError(error);
    exitCode = 1;
} finally {
    await runCleanups();
}
// The browser stack's focus helper would keep the process alive.
process.exit(exitCode);

async function main(argv: string[]) {
    const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: { runner: { type: 'string', default: 'all' }, pause: { type: 'string' } },
    });
    const [command, ...rest] = positionals;
    if (rest.length > 0) {
        throw new Error(`Unexpected arguments: ${rest.join(' ')}\n${USAGE}`);
    }

    switch (command) {
        case 'run':
            return run(values.runner, values.pause == null ? DEFAULT_PAUSE_MS : parsePause(values.pause));
        case 'person':
            return recordPerson();
        case 'compare':
            console.log(formatComparison(await loadLatestRunResults(RESULTS_FOLDER)));
            return;
        default:
            throw new Error(USAGE);
    }
}

async function run(runner: string, pauseMs: number) {
    switch (runner) {
        case 'agent':
            return runAgent(pauseMs);
        case 'headless':
            return runHeadless(pauseMs);
        case 'all':
            await runAgent(pauseMs);
            await runHeadless(pauseMs);
            return;
        default:
            throw new Error(`Unknown runner: ${runner}\n${USAGE}`);
    }
}

/** The agent's path: the daemon's browser stack in the eval's state folder, driven by agent-browser through the tunnel. */
async function runAgent(pauseMs: number) {
    console.log('[agent] preparing the browser stack (the first run downloads Chrome for Testing)');
    const executable = await installAgentBrowser(STATE_FOLDER);
    const stack = await bootBrowserStack(STATE_FOLDER);
    cleanups.push(() => stack.stop());
    const driver = createAgentBrowserDriver({ executable, stack });
    cleanups.push(() => driver.close());
    try {
        await measure({ runner: 'agent', driver, pauseMs });
    } finally {
        await runCleanups();
    }
}

async function runHeadless(pauseMs: number) {
    const driver = await createPlaywrightDriver();
    cleanups.push(() => driver.close());
    try {
        await measure({ runner: 'headless', driver, pauseMs });
    } finally {
        await runCleanups();
    }
}

/** What `measure` runs. */
interface MeasureParams {
    runner: 'agent' | 'headless';
    driver: EvalDriver;
    pauseMs: number;
}

/** Runs every probe on the driver and saves the run; a failed probe is recorded and the others still run. */
async function measure(params: MeasureParams) {
    const { runner, driver, pauseMs } = params;
    const startedAt = new Date().toISOString();
    const probes: RunProbes = {};
    const probeErrors: RunResult['probeErrors'] = {};

    try {
        probes.shop = await runShopProbe({ driver, pauseMs, label: runner });
    } catch (error) {
        printError(error);
        probeErrors.shop = formatError(error);
    }

    const file = await saveRunResult(RESULTS_FOLDER, {
        runner,
        startedAt,
        finishedAt: new Date().toISOString(),
        browserVersion: await driver.browserVersion(),
        probes,
        probeErrors,
    });
    console.log(`[${runner}] saved ${file}`);
}

/** The person's control: prints the visit as instructions, reads the pasted results and saves them as a run. */
async function recordPerson() {
    const lines = [
        'Kontrola: Ty jako człowiek. Przejdź wizytę w sklepie w swoim zwykłym Chrome, swoim tempem.',
        '',
        ...formatPersonInstructions(createShopScenario(new Date())),
        '',
        'Na koniec, na liście produktów: kliknij „Eval data” w lewym dolnym rogu, poczekaj, aż „scored” zrówna się z „Actions”,',
        process.stdin.isTTY
            ? 'kliknij „Copy results” i naciśnij tu Enter: wynik zostanie odczytany ze schowka.'
            : 'kliknij „Copy results”; wynik zostanie odczytany ze standardowego wejścia.',
        '',
    ];
    console.log(lines.join('\n'));

    const visit = parseShopVisit(JSON.parse(await readResultsText()));
    const pending = visit.actions.filter(action => action.score == null && action.error == null).length;
    if (pending > 0) {
        console.warn(`${pending} actions were still pending when copied; they are saved as they are`);
    }
    const file = await saveRunResult(RESULTS_FOLDER, {
        runner: 'person',
        startedAt: visit.startedAt,
        finishedAt: new Date().toISOString(),
        browserVersion: /Chrome\/[\d.]+/.exec(visit.userAgent)?.[0] ?? visit.userAgent,
        probes: { shop: visit },
        probeErrors: {},
    });
    console.log(`[person] saved ${file} (${SHOP_URL})`);
}

/**
 * The copied results. From a terminal they are read from the clipboard once Enter is pressed: they are one long JSON line,
 * and a macOS terminal cuts a pasted line at about 1 KB. Piped in (`pbpaste | …`), they are read from stdin to its end.
 */
async function readResultsText() {
    if (!process.stdin.isTTY) {
        return await Bun.stdin.text();
    }
    const input = createInterface({ input: process.stdin });
    await input.question('');
    input.close();
    const clipboard = Bun.spawn(['pbpaste'], { stdout: 'pipe' });
    const text = await new Response(clipboard.stdout).text();
    if ((await clipboard.exited) !== 0) {
        throw new Error(
            'The clipboard could not be read (pbpaste); pipe the results in: pbpaste | bun run stealth:eval person',
        );
    }
    return text;
}

async function runCleanups() {
    for (const cleanup of cleanups.splice(0).toReversed()) {
        try {
            await cleanup();
        } catch (error) {
            printError(error);
        }
    }
}

/** Ctrl-C: closes agent-browser's session and the browsers, then exits, whatever the cleanup does. */
async function interrupt() {
    console.log('\nInterrupted, cleaning up');
    setTimeout(() => process.exit(130), INTERRUPT_CLEANUP_MS).unref();
    await runCleanups();
    process.exit(130);
}

function parsePause(value: string) {
    const pauseMs = Number(value);
    if (!Number.isInteger(pauseMs) || pauseMs < 0) {
        throw new Error(`--pause takes milliseconds, got ${value}`);
    }
    return pauseMs;
}

function printError(error: unknown) {
    console.error(`FAILED: ${formatError(error)}`);
}

/** The message with every cause after it. */
function formatError(error: unknown): string {
    if (!(error instanceof Error)) {
        return String(error);
    }
    return error.cause == null ? error.message : `${error.message}: ${formatError(error.cause)}`;
}
