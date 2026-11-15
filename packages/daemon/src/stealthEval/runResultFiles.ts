import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { parseShopVisit } from './parseShopVisit.js';
import type { RunnerName, RunProbes, RunResult } from './StealthEvalTypes.js';

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

/** The latest saved run of each runner, in the order agent, headless, person; a runner with no run is left out. */
export async function loadLatestRunResults(folder: string): Promise<RunResult[]> {
    let names: string[];
    try {
        names = await readdir(folder);
    } catch {
        return [];
    }

    const latest: RunResult[] = [];
    for (const runner of RUNNERS) {
        const name = names
            .filter(file => file.endsWith(`-${runner}.json`))
            .toSorted()
            .at(-1);
        if (name != null) {
            latest.push(parseRunResult(JSON.parse(await readFile(path.join(folder, name), 'utf8')), name));
        }
    }
    return latest;
}

/** Checks a saved run's shape; `file` names it in the error. */
function parseRunResult(value: unknown, file: string): RunResult {
    if (!isPlainObject(value)) {
        throw new Error(`${file} is not a run result`);
    }
    const { runner, startedAt, finishedAt, browserVersion, probes, probeErrors } = value;
    if (
        typeof runner !== 'string' ||
        !isRunner(runner) ||
        typeof startedAt !== 'string' ||
        typeof finishedAt !== 'string' ||
        typeof browserVersion !== 'string' ||
        !isPlainObject(probes) ||
        !isPlainObject(probeErrors)
    ) {
        throw new Error(`${file} is not a run result`);
    }

    const parsedProbes: RunProbes = {};
    if (probes['shop'] != null) {
        parsedProbes.shop = parseShopVisit(probes['shop']);
    }
    const shopError = probeErrors['shop'];
    return {
        runner,
        startedAt,
        finishedAt,
        browserVersion,
        probes: parsedProbes,
        probeErrors: typeof shopError === 'string' ? { shop: shopError } : {},
    };
}

function isRunner(value: string): value is RunnerName {
    return RUNNERS.some(runner => runner === value);
}
