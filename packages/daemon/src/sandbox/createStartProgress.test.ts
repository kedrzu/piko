import { expect, test } from 'bun:test';

import type { SandboxStartProgress } from '@piko/common/api/SandboxTypes.js';

import type { StartProgress } from './createStartProgress.js';
import { createStartProgress } from './createStartProgress.js';

test('has no bar until a step is planned', () => {
    const { progress, clock } = setup();
    expect(progress.snapshot()).toBeNull();

    clock.t += 10_000;
    progress.begin('agent');
    progress.reportFraction('agent', 0.5);
    progress.complete('agent');

    expect(progress.snapshot()).toBeNull();
});

test('a first run walks every step with a rising bar below 1 and reaches 1 only on finish', () => {
    const { progress, clock } = setup();
    progress.addSteps([
        { id: 'download', expectedMs: 60_000 },
        { id: 'boot', expectedMs: 20_000 },
        { id: 'build', expectedMs: 90_000 },
        { id: 'restart', expectedMs: 10_000 },
        { id: 'agent', expectedMs: 10_000 },
    ]);
    const reads: SandboxStartProgress[] = [];

    progress.begin('download');
    for (let mb = 10; mb <= 100; mb += 10) {
        reads.push(...poll(progress, clock, 5_000));
        progress.reportBytes('download', { done: mb * 1e6, total: 100e6 });
    }
    progress.complete('download');

    progress.begin('boot');
    reads.push(...poll(progress, clock, 25_000));
    progress.complete('boot');

    progress.begin('build');
    for (let step = 1; step <= 10; step++) {
        reads.push(...poll(progress, clock, 9_000));
        progress.reportFraction('build', step / 10);
    }
    progress.complete('build');

    for (const id of ['restart', 'agent']) {
        progress.begin(id);
        reads.push(...poll(progress, clock, 10_000));
        progress.complete(id);
    }

    expectRising(reads);
    expect(reads.every(read => read.fraction < 1 && read.remainingMs >= 0)).toBe(true);

    progress.finish();
    const expected: SandboxStartProgress = { fraction: 1, remainingMs: 0 };
    expect(progress.snapshot()).toEqual(expected);
});

test('a plain start fills the bar from its own steps only, close to full by its end', () => {
    const { progress, clock } = setup();
    progress.addSteps([{ id: 'agent', expectedMs: 10_000 }]);
    progress.begin('agent');

    const halfway = poll(progress, clock, 5_000);
    const nearEnd = poll(progress, clock, 4_500);

    expect(halfway.at(-1)?.remainingMs).toBe(5_000);
    // Elapsed over the total plus the 1 s reserve.
    expect(halfway.at(-1)?.fraction).toBeCloseTo(5 / 11, 2);
    expect(nearEnd.at(-1)?.fraction).toBeGreaterThan(0.85);
});

test('a step past its estimate adds no time left and the bar keeps rising below 1', () => {
    const { progress, clock } = setup();
    progress.addSteps([
        { id: 'boot', expectedMs: 10_000 },
        { id: 'agent', expectedMs: 60_000 },
    ]);
    progress.begin('boot');
    poll(progress, clock, 10_000);

    const overrun = poll(progress, clock, 20_000);

    expectStrictlyRising(overrun);
    expect(overrun.at(-1)?.fraction).toBeLessThan(1);
    expect(overrun.every(read => read.remainingMs === 60_000)).toBe(true);
});

test('past the estimate of the last step the bar keeps creeping below 1 and the time left stays at 0', () => {
    const { progress, clock } = setup();
    progress.addSteps([{ id: 'agent', expectedMs: 60_000 }]);
    progress.begin('agent');
    const onTime = poll(progress, clock, 60_000);

    // Four times the 6 s reserve of a 60 s plan.
    const overrun = poll(progress, clock, 24_000);

    expect(onTime.at(-1)?.fraction).toBeCloseTo(1 - 6 / 66, 2);
    expectStrictlyRising([...onTime.slice(-1), ...overrun]);
    expect(overrun.at(-1)?.fraction).toBeLessThan(0.99);
    expect(overrun.every(read => read.remainingMs === 0)).toBe(true);
});

test('steps added mid-run slow the bar without moving it back', () => {
    const { progress, clock } = setup();
    progress.addSteps([{ id: 'boot', expectedMs: 60_000 }]);
    progress.begin('boot');
    const before = poll(progress, clock, 30_000);

    progress.addSteps([
        { id: 'build', expectedMs: 120_000 },
        { id: 'agent', expectedMs: 30_000 },
    ]);
    const after = poll(progress, clock, 10_000);

    expectRising([...before, ...after]);
    expect(after[0]?.remainingMs).toBe(29_500 + 120_000 + 30_000);
});

test('a download slower than expected raises the estimate without moving the bar back', () => {
    const { progress, clock } = setup();
    progress.addSteps([
        { id: 'download', expectedMs: 20_000 },
        { id: 'agent', expectedMs: 10_000 },
    ]);
    progress.begin('download');
    progress.reportBytes('download', { done: 0, total: 100e6 });
    const before = poll(progress, clock, 5_000);

    progress.reportBytes('download', { done: 10e6, total: 100e6 });
    const after = poll(progress, clock, 500);

    expectRising([...before, ...after]);
    // 10 MB in 5.5 s is 1.818 MB/s, so 90 MB take 49.5 s; the agent step is still 10 s.
    expect(after[0]?.remainingMs).toBe(49_500 + 10_000);
    expect(before[0]?.remainingMs).toBe(20_000 + 10_000);
});

test('steps that ran slower than expected scale the steps not yet started', () => {
    const { progress, clock } = setup();
    progress.addSteps([
        { id: 'boot', expectedMs: 10_000 },
        { id: 'agent', expectedMs: 10_000 },
    ]);
    progress.begin('boot');
    clock.t += 20_000;
    progress.complete('boot');

    expect(progress.snapshot()?.remainingMs).toBe(20_000);
});

test('a build reporting its own fraction estimates the rest of its expected time', () => {
    const { progress, clock } = setup();
    progress.addSteps([{ id: 'build', expectedMs: 100_000 }]);
    progress.begin('build');
    clock.t += 90_000;
    progress.reportFraction('build', 0.25);

    expect(progress.snapshot()?.remainingMs).toBe(75_000);
});

test('ignores reports it cannot use and never throws', () => {
    const { progress, clock } = setup();
    progress.addSteps([
        { id: 'agent', expectedMs: 10_000 },
        { id: 'agent', expectedMs: 99_000 },
    ]);
    progress.begin('agent');
    progress.begin('unknown');
    progress.complete('unknown');
    progress.reportBytes('agent', { done: 5, total: 0 });
    progress.reportFraction('agent', Number.NaN);
    clock.t += 4_000;

    expect(progress.snapshot()?.remainingMs).toBe(6_000);

    progress.complete('agent');
    progress.complete('agent');
    expect(progress.snapshot()?.remainingMs).toBe(0);
});

function setup() {
    const clock = { t: 1_000_000 };
    const progress = createStartProgress({ now: () => clock.t });
    return { progress, clock };
}

/** Reads the bar every 500 ms for `durationMs`, as the app polls it. */
function poll(progress: StartProgress, clock: { t: number }, durationMs: number) {
    const reads: SandboxStartProgress[] = [];
    for (let elapsed = 0; elapsed < durationMs; elapsed += 500) {
        clock.t += 500;
        const read = progress.snapshot();
        expect(read).not.toBeNull();
        reads.push(read!);
    }
    return reads;
}

function expectRising(reads: SandboxStartProgress[]) {
    for (let i = 1; i < reads.length; i++) {
        expect(reads[i]!.fraction).toBeGreaterThanOrEqual(reads[i - 1]!.fraction);
    }
}

function expectStrictlyRising(reads: SandboxStartProgress[]) {
    for (let i = 1; i < reads.length; i++) {
        expect(reads[i]!.fraction).toBeGreaterThan(reads[i - 1]!.fraction);
    }
}
