import type { SandboxStartProgress } from '@piko/common/api/SandboxTypes.js';

/**
 * The share of the plan's expected total kept in reserve: the bar is integrated as if that much time were always left,
 * so an accurate estimate ends near 0.9 and an overrunning step still has room to creep.
 */
const RESERVE_SHARE = 0.1;
/** The smallest reserve, so a very short plan does not rush the bar to its cap. */
const MIN_RESERVE_MS = 1_000;
/** The bar stops here until the start finishes. */
const MAX_UNFINISHED_FRACTION = 0.99;
const MIN_PACE = 0.5;
const MAX_PACE = 3;

/** A step of a sandbox start, with how long it is expected to take on a machine of average pace. */
export interface StartProgressStep {
    id: string;
    expectedMs: number;
}

/** Bytes transferred so far by a step that measures itself in bytes (a download). */
export interface StartProgressBytes {
    done: number;
    total: number;
}

/** Options of {@link createStartProgress}. */
export interface CreateStartProgressOptions {
    /** The clock, in milliseconds; injected so tests are deterministic. */
    now?: () => number;
}

/**
 * Tracks the steps of a sandbox start and turns them into a progress bar. It never throws: progress is advisory, and a
 * report it cannot use (an unknown step, a non-finite number) is ignored.
 */
export interface StartProgress {
    /** Appends steps to the plan. A step whose id is already planned is ignored. */
    addSteps(steps: StartProgressStep[]): void;
    /** Marks a planned step as running; a second call, or an unknown id, is ignored. */
    begin(id: string): void;
    /** Marks a planned step as done. A step never begun counts as begun and done at once. */
    complete(id: string): void;
    /** Reports a running step's bytes; its remaining time is then measured from the transfer speed. */
    reportBytes(id: string, bytes: StartProgressBytes): void;
    /** Reports how much (0–1) of a running step is done, when the step knows (an image build). */
    reportFraction(id: string, fraction: number): void;
    /** Marks the whole start as done: the bar reads 1 from then on. */
    finish(): void;
    /**
     * Reads the bar. Every read advances it, so it must be read only to show it. `null` until a step is planned, so a
     * start with no plan never shows a bar.
     */
    snapshot(): SandboxStartProgress | null;
}

interface StepState {
    id: string;
    expectedMs: number;
    beganAt?: number;
    completedAt?: number;
    measurement?: StepMeasurement;
}

type StepMeasurement =
    | { kind: 'bytes'; done: number; total: number; firstDone: number; firstAt: number }
    | { kind: 'fraction'; fraction: number };

/**
 * Creates the progress tracker of one sandbox start. The bar is the remaining-time estimate integrated over the reads:
 * each read shrinks what is left of the bar by `R / (R + dt)`, `R` being the estimate plus a reserve (a tenth of the
 * plan's expected total, at least 1 s) and `dt` the time since the previous read. With an accurate estimate the bar
 * reaches about 0.9 when the estimate runs out; a growing plan or a rising estimate only slows the bar, never moves it
 * back. Past the estimate the time spent overrunning is added to `R` too, so the bar keeps creeping, ever slower: it
 * reaches the 0.99 cap only after about eight reserves of overrun, and settles there until `finish()`.
 *
 * @__NO_SIDE_EFFECTS__
 */
export function createStartProgress(options: CreateStartProgressOptions = {}): StartProgress {
    const now = options.now ?? Date.now;
    const steps: StepState[] = [];
    const stepsById = new Map<string, StepState>();
    let plannedMs = 0;
    let rest = 1;
    let lastReadAt: number | undefined;
    let overrunSince: number | undefined;
    let finished = false;

    return {
        addSteps,
        begin,
        complete,
        reportBytes,
        reportFraction,
        finish,
        snapshot,
    };

    function addSteps(newSteps: StartProgressStep[]) {
        for (const step of newSteps) {
            if (stepsById.has(step.id)) {
                continue;
            }
            const state: StepState = {
                id: step.id,
                expectedMs: Number.isFinite(step.expectedMs) ? Math.max(0, step.expectedMs) : 0,
            };
            steps.push(state);
            plannedMs += state.expectedMs;
            stepsById.set(step.id, state);
        }
        lastReadAt ??= now();
    }

    function begin(id: string) {
        const step = stepsById.get(id);
        if (step && step.beganAt == null) {
            step.beganAt = now();
        }
    }

    function complete(id: string) {
        const step = stepsById.get(id);
        if (!step || step.completedAt != null) {
            return;
        }
        const at = now();
        step.beganAt ??= at;
        step.completedAt = at;
    }

    function reportBytes(id: string, bytes: StartProgressBytes) {
        if (!Number.isFinite(bytes.done) || !Number.isFinite(bytes.total) || bytes.total <= 0) {
            return;
        }
        const step = getRunningStep(id);
        if (!step) {
            return;
        }
        const done = Math.min(Math.max(0, bytes.done), bytes.total);
        if (step.measurement?.kind === 'bytes') {
            step.measurement.done = done;
            step.measurement.total = bytes.total;
        } else {
            step.measurement = { kind: 'bytes', done, total: bytes.total, firstDone: done, firstAt: now() };
        }
    }

    function reportFraction(id: string, fraction: number) {
        if (!Number.isFinite(fraction)) {
            return;
        }
        const step = getRunningStep(id);
        if (!step) {
            return;
        }
        step.measurement = { kind: 'fraction', fraction: Math.min(Math.max(0, fraction), 1) };
    }

    function finish() {
        finished = true;
    }

    function snapshot(): SandboxStartProgress | null {
        if (finished) {
            return { fraction: 1, remainingMs: 0 };
        }
        if (lastReadAt == null) {
            return null;
        }

        const at = now();
        const remainingMs = getRemainingMs(at);
        overrunSince = remainingMs > 0 ? undefined : (overrunSince ?? at);
        const overrunMs = overrunSince == null ? 0 : at - overrunSince;
        const horizon = remainingMs + Math.max(MIN_RESERVE_MS, plannedMs * RESERVE_SHARE) + overrunMs;
        const dt = Math.max(0, at - lastReadAt);
        rest *= horizon / (horizon + dt);
        lastReadAt = at;

        return {
            fraction: Math.min(1 - rest, MAX_UNFINISHED_FRACTION),
            remainingMs: Math.round(remainingMs),
        };
    }

    /** A step reported on before `begin()` is taken as begun now; a completed or unknown one is ignored. */
    function getRunningStep(id: string) {
        const step = stepsById.get(id);
        if (!step || step.completedAt != null) {
            return undefined;
        }
        step.beganAt ??= now();
        return step;
    }

    function getRemainingMs(at: number) {
        const pace = getPace();
        let remaining = 0;
        for (const step of steps) {
            if (step.completedAt != null) {
                continue;
            }
            if (step.beganAt == null) {
                remaining += step.expectedMs * pace;
                continue;
            }
            remaining += getStepRemainingMs(step, step.beganAt, at, pace);
        }
        return remaining;
    }

    function getStepRemainingMs(step: StepState, beganAt: number, at: number, pace: number) {
        const measurement = step.measurement;
        if (!measurement) {
            return Math.max(0, step.expectedMs * pace - (at - beganAt));
        }
        if (measurement.kind === 'fraction') {
            return step.expectedMs * pace * (1 - measurement.fraction);
        }
        const left = measurement.total - measurement.done;
        const transferred = measurement.done - measurement.firstDone;
        const elapsed = at - measurement.firstAt;
        if (transferred > 0 && elapsed > 0) {
            return left / (transferred / elapsed);
        }
        // No transfer measured yet: the expected time, scaled by what is left.
        return step.expectedMs * (left / measurement.total);
    }

    /**
     * How much slower than expected this machine is, from the steps that ran on time alone. A measured step's duration
     * says more about the network or the build than about the machine, so it does not count; neither does a step
     * that took no time, such as one completed without ever being begun.
     */
    function getPace() {
        let actual = 0;
        let expected = 0;
        for (const step of steps) {
            if (
                step.measurement ||
                step.beganAt == null ||
                step.completedAt == null ||
                step.completedAt === step.beganAt
            ) {
                continue;
            }
            actual += step.completedAt - step.beganAt;
            expected += step.expectedMs;
        }
        if (expected <= 0) {
            return 1;
        }
        return Math.min(Math.max(actual / expected, MIN_PACE), MAX_PACE);
    }
}
