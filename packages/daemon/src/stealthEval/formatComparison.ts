import type { RunResult, ShopAction, ShopVisit } from './StealthEvalTypes.js';

/**
 * The comparison `compare` prints: per run its header, then for the shop a row per action (the n-th occurrence of an
 * action name lines up across runners) with each runner's score and the mean, and a summary of how input arrived.
 * @__NO_SIDE_EFFECTS__
 */
export function formatComparison(runs: RunResult[]): string {
    if (runs.length === 0) {
        return 'No runs saved yet.';
    }

    const lines = runs.map(run => {
        const error = run.probeErrors.shop == null ? '' : `, shop failed: ${run.probeErrors.shop}`;
        return `${run.runner}: ${run.startedAt}, ${run.browserVersion}${error}`;
    });
    const header = ['', ...runs.map(run => run.runner)];
    const visits = runs.map(run => run.probes.shop);

    const keyedActions = visits.map(visit => keyActions(visit?.actions ?? []));
    const actionKeys = [...new Set(keyedActions.flatMap(actions => [...actions.keys()]))];
    const actionRows = actionKeys.map(key => [key, ...keyedActions.map(actions => formatAction(actions.get(key)))]);
    const meanRow = ['mean', ...visits.map(visit => formatScore(meanScore(visit)))];

    const inputSummaries = visits.map(visit => (visit ? summarizeInput(visit) : null));
    const inputRows = INPUT_ROWS.map(({ label, key }) => [
        label,
        ...inputSummaries.map(summary => (summary ? String(summary[key]) : '-')),
    ]);

    return [
        ...lines,
        '',
        'Shop: reCAPTCHA score per action',
        formatTable([header, ...actionRows, meanRow]),
        '',
        'Shop: how input arrived',
        formatTable([header, ...inputRows]),
    ].join('\n');
}

/** Counts over a visit's input records. */
interface InputSummary {
    clicks: number;
    clicksWithoutMove: number;
    /** A driver's click moves the pointer once, straight onto the target: one move, no path. */
    clicksWithoutPath: number;
    clicksAtCentre: number;
    untrustedClicks: number;
    textFields: number;
    textWithoutKeydowns: number;
    pastes: number;
}

const INPUT_ROWS: { label: string; key: keyof InputSummary }[] = [
    { label: 'clicks', key: 'clicks' },
    { label: 'clicks with no mouse move before', key: 'clicksWithoutMove' },
    { label: 'clicks with no mouse path before', key: 'clicksWithoutPath' },
    { label: 'clicks at the exact centre', key: 'clicksAtCentre' },
    { label: 'untrusted clicks', key: 'untrustedClicks' },
    { label: 'text fields', key: 'textFields' },
    { label: 'text fields typed with no keydowns', key: 'textWithoutKeydowns' },
    { label: 'pastes', key: 'pastes' },
];

/** Each action under its name, the second and later occurrences as `name #n`. */
function keyActions(actions: ShopAction[]) {
    const counts = new Map<string, number>();
    const keyed = new Map<string, ShopAction>();
    for (const action of actions) {
        const count = (counts.get(action.action) ?? 0) + 1;
        counts.set(action.action, count);
        keyed.set(count === 1 ? action.action : `${action.action} #${count}`, action);
    }
    return keyed;
}

function formatAction(action: ShopAction | undefined) {
    if (!action) {
        return '-';
    }
    if (action.score != null) {
        return formatScore(action.score);
    }
    return action.error == null ? 'pending' : 'error';
}

function meanScore(visit: ShopVisit | undefined) {
    const scores = (visit?.actions ?? []).flatMap(action => (action.score == null ? [] : [action.score]));
    if (scores.length === 0) {
        return null;
    }
    let sum = 0;
    for (const score of scores) {
        sum += score;
    }
    return sum / scores.length;
}

function formatScore(score: number | null) {
    return score == null ? '-' : score.toFixed(2);
}

function summarizeInput(visit: ShopVisit): InputSummary {
    const summary: InputSummary = {
        clicks: 0,
        clicksWithoutMove: 0,
        clicksWithoutPath: 0,
        clicksAtCentre: 0,
        untrustedClicks: 0,
        textFields: 0,
        textWithoutKeydowns: 0,
        pastes: 0,
    };
    for (const record of visit.input) {
        switch (record.kind) {
            case 'click':
                summary.clicks++;
                if (record.mouseMovesBefore === 0) {
                    summary.clicksWithoutMove++;
                }
                if (record.pathPxBefore === 0) {
                    summary.clicksWithoutPath++;
                }
                if (record.offsetFromCenter.x === 0 && record.offsetFromCenter.y === 0) {
                    summary.clicksAtCentre++;
                }
                if (!record.isTrusted) {
                    summary.untrustedClicks++;
                }
                break;
            case 'text':
                summary.textFields++;
                if (record.keydowns === 0 && record.chars > 0) {
                    summary.textWithoutKeydowns++;
                }
                summary.pastes += record.pastes;
                break;
            case 'scroll':
                break;
        }
    }
    return summary;
}

/** Left-aligns the first column and right-aligns the rest, two spaces apart. */
function formatTable(rows: string[][]) {
    const widths: number[] = [];
    for (const row of rows) {
        for (const [index, cell] of row.entries()) {
            widths[index] = Math.max(widths[index] ?? 0, cell.length);
        }
    }
    return rows
        .map(row =>
            row
                .map((cell, index) =>
                    index === 0 ? cell.padEnd(widths[index] ?? 0) : cell.padStart(widths[index] ?? 0),
                )
                .join('  ')
                .trimEnd(),
        )
        .join('\n');
}
