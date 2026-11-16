import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

import { assertNever } from '@nzyme/utils/assertNever.js';

import { ALLEGRO_MAX_CAP, runAllegroProbe } from './allegro.js';
import { bootBrowserStack } from './bootBrowserStack.js';
import { createAgentBrowserDriver } from './createAgentBrowserDriver.js';
import { createPlaywrightDriver } from './createPlaywrightDriver.js';
import { formatComparison } from './formatComparison.js';
import { formatPersonInstructions } from './formatPersonInstructions.js';
import { installAgentBrowser } from './installAgentBrowser.js';
import { runLeakPagesProbe } from './leakPages.js';
import { runPanelProbe } from './panel.js';
import { parseShopVisit } from './parseShopVisit.js';
import { loadLatestReadings, saveRunResult } from './runResultFiles.js';
import { runShopProbe } from './runShopProbe.js';
import { createShopScenario, SHOP_URL } from './shopScenario.js';
import { PROBE_NAMES } from './StealthEvalTypes.js';
import type { EvalDriver, ProbeName, RunProbes, RunResult } from './StealthEvalTypes.js';

// `bun run stealth:eval <command>`: measures how detectable the agent's browser is (design `docs/design/stealth-browsing`,
// D6, D9, D11). `run` runs the probes (the shop visit, the leak test pages, the vendor panel, Allegro searches) with
// the agent's own browser (the daemon's browser stack and agent-browser) and with a plain headless Chromium; `person`
// takes the shop visit made by hand; `compare` prints each runner's latest reading of every probe side by side.
// Everything it keeps lives in its own state folder, never in the person's poweragents state.

const STATE_FOLDER = path.join(os.homedir(), '.poweragents-stealth-eval');
const RESULTS_FOLDER = path.join(STATE_FOLDER, 'results');
const DEFAULT_PAUSE_MS = 3000;
/** Allegro only when named: every search spends the home connection's reputation with DataDome. */
const DEFAULT_PROBES = 'shop,leaks,panel';
const DEFAULT_ALLEGRO_INTERVAL_MS = 8000;
const DEFAULT_ALLEGRO_CAP = 40;
/** How long the cleanup on Ctrl-C may take before the process exits anyway. */
const INTERRUPT_CLEANUP_MS = 15_000;
const USAGE = `Usage: bun run stealth:eval <command>
  run [options]   run the probes
    --runner agent|headless|all        default: all
    --probes shop,leaks,panel,allegro  default: ${DEFAULT_PROBES}; allegro only when named
    --pause <ms>                       between the shop visit's steps, default ${DEFAULT_PAUSE_MS}
    --allegro-interval <ms>            between the starts of two Allegro searches, default ${DEFAULT_ALLEGRO_INTERVAL_MS}
    --allegro-cap <n>                  the most Allegro searches, default ${DEFAULT_ALLEGRO_CAP}, at most ${ALLEGRO_MAX_CAP}
  person          make the shop visit by hand and paste its results
  compare         print each runner's latest reading of every probe`;

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
        options: {
            runner: { type: 'string', default: 'all' },
            probes: { type: 'string', default: DEFAULT_PROBES },
            pause: { type: 'string' },
            'allegro-interval': { type: 'string' },
            'allegro-cap': { type: 'string' },
        },
    });
    const [command, ...rest] = positionals;
    if (rest.length > 0) {
        throw new Error(`Unexpected arguments: ${rest.join(' ')}\n${USAGE}`);
    }

    switch (command) {
        case 'run': {
            const allegroCap = parseCount('--allegro-cap', values['allegro-cap'], DEFAULT_ALLEGRO_CAP);
            if (allegroCap < 1 || allegroCap > ALLEGRO_MAX_CAP) {
                throw new Error(`--allegro-cap takes 1 to ${ALLEGRO_MAX_CAP}, got ${allegroCap}`);
            }
            return run(values.runner, {
                probes: parseProbes(values.probes),
                pauseMs: parseCount('--pause', values.pause, DEFAULT_PAUSE_MS),
                allegroIntervalMs: parseCount(
                    '--allegro-interval',
                    values['allegro-interval'],
                    DEFAULT_ALLEGRO_INTERVAL_MS,
                ),
                allegroCap,
            });
        }
        case 'person':
            return recordPerson();
        case 'compare':
            console.log(formatComparison(await loadLatestReadings(RESULTS_FOLDER)));
            return;
        default:
            throw new Error(USAGE);
    }
}

/** What a run measures and how. */
interface RunOptions {
    probes: ProbeName[];
    pauseMs: number;
    allegroIntervalMs: number;
    allegroCap: number;
}

async function run(runner: string, options: RunOptions) {
    switch (runner) {
        case 'agent':
            return runAgent(options);
        case 'headless':
            return runHeadless(options);
        case 'all':
            await runAgent(options);
            await runHeadless(options);
            return;
        default:
            throw new Error(`Unknown runner: ${runner}\n${USAGE}`);
    }
}

/** The agent's path: the daemon's browser stack in the eval's state folder, driven by agent-browser through the tunnel. */
async function runAgent(options: RunOptions) {
    console.log('[agent] preparing the browser stack (the first run downloads Chrome for Testing)');
    const executable = await installAgentBrowser(STATE_FOLDER);
    const stack = await bootBrowserStack(STATE_FOLDER);
    cleanups.push(() => stack.stop());
    const driver = createAgentBrowserDriver({ executable, stack });
    cleanups.push(() => driver.close());
    try {
        await measure('agent', driver, options);
    } finally {
        await runCleanups();
    }
}

async function runHeadless(options: RunOptions) {
    const driver = await createPlaywrightDriver();
    cleanups.push(() => driver.close());
    try {
        await measure('headless', driver, options);
    } finally {
        await runCleanups();
    }
}

/** Runs the chosen probes on the driver and saves the run; a failed probe is recorded and the others still run. */
async function measure(runner: 'agent' | 'headless', driver: EvalDriver, options: RunOptions) {
    const startedAt = new Date().toISOString();
    const probes: RunProbes = {};
    const probeErrors: RunResult['probeErrors'] = {};

    for (const probe of PROBE_NAMES) {
        if (!options.probes.includes(probe)) {
            continue;
        }
        try {
            await runProbe(probe);
        } catch (error) {
            printError(error);
            probeErrors[probe] = formatError(error);
        }
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

    async function runProbe(probe: ProbeName) {
        switch (probe) {
            case 'shop':
                probes.shop = await runShopProbe({ driver, pauseMs: options.pauseMs, label: runner });
                break;
            case 'leaks':
                probes.leaks = await runLeakPagesProbe({ driver, label: runner });
                break;
            case 'panel':
                probes.panel = await runPanelProbe({ driver, label: runner });
                break;
            case 'allegro':
                probes.allegro = await runAllegroProbe({
                    driver,
                    label: runner,
                    intervalMs: options.allegroIntervalMs,
                    cap: options.allegroCap,
                });
                break;
            default:
                assertNever(probe);
        }
    }
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

/** A non-negative whole number option, or its default when it is not given. */
function parseCount(option: string, value: string | undefined, fallback: number) {
    if (value == null) {
        return fallback;
    }
    const count = Number(value);
    if (!Number.isInteger(count) || count < 0) {
        throw new Error(`${option} takes a whole number, got ${value}`);
    }
    return count;
}

/** The probes `--probes` names, comma-separated. */
function parseProbes(value: string): ProbeName[] {
    const probes: ProbeName[] = [];
    for (const name of value.split(',').map(part => part.trim())) {
        const probe = PROBE_NAMES.find(candidate => candidate === name);
        if (probe == null) {
            throw new Error(`Unknown probe: ${name}\n${USAGE}`);
        }
        probes.push(probe);
    }
    return probes;
}

function printError(error: unknown) {
    console.error(`FAILED: ${formatError(error)}`);
}

/** The message with every cause after it. */
function formatError(error: unknown): string {
    if (!(error instanceof Error)) {
        return String(error);
    }
    if (error.cause == null) {
        return error.message;
    }
    // A wrapper that already quotes its cause's message (`Invalid shop results: …`) needs it only once.
    const cause = formatError(error.cause);
    return error.message.endsWith(cause) ? error.message : `${error.message}: ${cause}`;
}
