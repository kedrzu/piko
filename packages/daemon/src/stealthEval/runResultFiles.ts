import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parseAllegroRun } from './allegro.js';
import { asObject, asOneOf, asString } from './jsonShape.js';
import { parseLeakPageResults } from './leakPages.js';
import { parsePanelResults } from './panel.js';
import { parseShopVisit } from './parseShopVisit.js';
import { PROBE_NAMES } from './StealthEvalTypes.js';
import type { ProbeName, RunnerName, RunProbes, RunResult } from './StealthEvalTypes.js';

const RUNNERS: readonly RunnerName[] = ['agent', 'headless', 'person'];

/**
 * Saves a run as `<startedAt>-<runner>.json` in `folder` (colons replaced, so the name is valid everywhere and still
 * sorts by time) and resolves with the file's path.
 */
export async function saveRunResult(folder: string, result: RunResult): Promise<string> {
    await mkdir(folder, { recursive: true });
    const file = path.join(folder, `${result.startedAt.replaceAll(':', '-')}-${result.runner}.json`);
    await writeFile(file, `${JSON.stringify(result, null, 2)}\n`);
    return file;
}

/** Where a probe's reading in `RunnerReadings` comes from. */
export interface ReadingSource {
    startedAt: string;
    browserVersion: string;
}

/**
 * A runner's latest reading of each probe, each from the newest run that ran it: runs choose their probes, so the
 * newest run alone (an Allegro-only run, say) would hide the others.
 */
export interface RunnerReadings {
    runner: RunnerName;
    probes: RunProbes;
    probeErrors: Partial<Record<ProbeName, string>>;
    /** The run behind each probe's reading or error. */
    sources: Partial<Record<ProbeName, ReadingSource>>;
}

/** Each runner's latest readings, in the order agent, headless, person; a runner with no run is left out. */
export async function loadLatestReadings(folder: string): Promise<RunnerReadings[]> {
    let names: string[];
    try {
        names = await readdir(folder);
    } catch {
        return [];
    }

    const latest: RunnerReadings[] = [];
    for (const runner of RUNNERS) {
        const files = names
            .filter(file => file.endsWith(`-${runner}.json`))
            .toSorted()
            .toReversed();
        if (files.length === 0) {
            continue;
        }
        const readings: RunnerReadings = { runner, probes: {}, probeErrors: {}, sources: {} };
        for (const file of files) {
            const run = parseRunResult(JSON.parse(await readFile(path.join(folder, file), 'utf8')), file);
            for (const probe of PROBE_NAMES) {
                if (readings.sources[probe] != null || (run.probes[probe] == null && run.probeErrors[probe] == null)) {
                    continue;
                }
                copyProbe(readings.probes, run.probes, probe);
                const error = run.probeErrors[probe];
                if (error != null) {
                    readings.probeErrors[probe] = error;
                }
                readings.sources[probe] = { startedAt: run.startedAt, browserVersion: run.browserVersion };
            }
            if (PROBE_NAMES.every(probe => readings.sources[probe] != null)) {
                break;
            }
        }
        latest.push(readings);
    }
    return latest;
}

/** Checks a saved run's shape; `file` names it in the error, and its cause names the field. */
function parseRunResult(value: unknown, file: string): RunResult {
    try {
        const run = asObject(value, 'run');
        const probes = asObject(run['probes'], 'probes');
        const probeErrors = asObject(run['probeErrors'], 'probeErrors');
        const parsedProbes: RunProbes = {};
        if (probes['shop'] != null) {
            parsedProbes.shop = parseShopVisit(probes['shop']);
        }
        if (probes['leaks'] != null) {
            parsedProbes.leaks = parseLeakPageResults(probes['leaks']);
        }
        if (probes['panel'] != null) {
            parsedProbes.panel = parsePanelResults(probes['panel']);
        }
        if (probes['allegro'] != null) {
            parsedProbes.allegro = parseAllegroRun(probes['allegro']);
        }
        const parsedErrors: RunResult['probeErrors'] = {};
        for (const probe of PROBE_NAMES) {
            const error = probeErrors[probe];
            if (typeof error === 'string') {
                parsedErrors[probe] = error;
            }
        }
        return {
            runner: asOneOf(run['runner'], RUNNERS, 'runner'),
            startedAt: asString(run['startedAt'], 'startedAt'),
            finishedAt: asString(run['finishedAt'], 'finishedAt'),
            browserVersion: asString(run['browserVersion'], 'browserVersion'),
            probes: parsedProbes,
            probeErrors: parsedErrors,
        };
    } catch (error) {
        throw new Error(`${file} is not a run result`, { cause: error });
    }
}

/** Copies one probe's reading; generic, so the reading's type follows the probe's name. */
function copyProbe<P extends ProbeName>(target: RunProbes, source: RunProbes, probe: P) {
    target[probe] = source[probe];
}
