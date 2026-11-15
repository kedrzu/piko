import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { loadLatestReadings, saveRunResult } from './runResultFiles.js';
import type { RunnerReadings } from './runResultFiles.js';
import type { LeakPageResult, RunResult } from './StealthEvalTypes.js';

test("each probe's reading comes from the newest run that ran it, so a run of one probe hides no other", async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), 'stealth-eval-'));
    try {
        const oldLeaks = [leak('fail')];
        await saveRunResult(folder, run('2026-11-15T10:00:00.000Z', { probes: { leaks: oldLeaks } }));
        await saveRunResult(
            folder,
            run('2026-11-15T11:00:00.000Z', { probes: { leaks: [leak('pass')] }, probeErrors: { panel: 'boom' } }),
        );
        await saveRunResult(
            folder,
            run('2026-11-15T12:00:00.000Z', { probes: {}, probeErrors: { allegro: 'blocked' } }),
        );

        const expected: RunnerReadings[] = [
            {
                runner: 'agent',
                probes: { leaks: [leak('pass')] },
                probeErrors: { panel: 'boom', allegro: 'blocked' },
                sources: {
                    leaks: { startedAt: '2026-11-15T11:00:00.000Z', browserVersion: 'Chrome/157' },
                    panel: { startedAt: '2026-11-15T11:00:00.000Z', browserVersion: 'Chrome/157' },
                    allegro: { startedAt: '2026-11-15T12:00:00.000Z', browserVersion: 'Chrome/157' },
                },
            },
        ];
        expect(await loadLatestReadings(folder)).toEqual(expected);
    } finally {
        await rm(folder, { recursive: true });
    }
});

function run(startedAt: string, parts: Pick<RunResult, 'probes'> & Partial<RunResult>): RunResult {
    return {
        runner: 'agent',
        startedAt,
        finishedAt: startedAt,
        browserVersion: 'Chrome/157',
        probeErrors: {},
        ...parts,
    };
}

function leak(verdict: LeakPageResult['verdict']): LeakPageResult {
    return { page: 'botd', url: 'https://botd.test/', verdict, failed: [], details: {}, error: null };
}
