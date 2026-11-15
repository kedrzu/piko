import type { RunnerReadings } from './runResultFiles.js';
import { PROBE_NAMES } from './StealthEvalTypes.js';
import type { LeakPageResult, PanelSiteResult, ProbeName, ShopAction, ShopVisit } from './StealthEvalTypes.js';

/**
 * The comparison `compare` prints: per runner where each probe's reading comes from, then a section per probe any
 * runner has. The shop: a row per action (the n-th occurrence of an action name lines up across runners) with each
 * runner's score and the mean, and a summary of how input arrived. The leak pages: each page's verdict per runner and
 * the checks that failed. The panel: each site's outcome per runner and the evidence. Allegro: the searches before the
 * first CAPTCHA.
 * @__NO_SIDE_EFFECTS__
 */
export function formatComparison(readings: RunnerReadings[]): string {
    if (readings.length === 0) {
        return 'No runs saved yet.';
    }

    const lines = readings.flatMap(reading =>
        PROBE_NAMES.flatMap(probe => {
            const source = reading.sources[probe];
            if (source == null) {
                return [];
            }
            const error = reading.probeErrors[probe];
            return [
                `${reading.runner} ${probe}: ${source.startedAt}, ${source.browserVersion}${error == null ? '' : `, failed: ${error}`}`,
            ];
        }),
    );
    const header = ['', ...readings.map(reading => reading.runner)];

    return [
        ...lines,
        ...(has('shop') ? formatShop(readings, header) : []),
        ...(has('leaks') ? formatLeaks(readings, header) : []),
        ...(has('panel') ? formatPanel(readings, header) : []),
        ...(has('allegro') ? formatAllegro(readings, header) : []),
    ].join('\n');

    function has(probe: ProbeName) {
        return readings.some(reading => reading.sources[probe] != null);
    }
}

function formatShop(readings: RunnerReadings[], header: string[]) {
    const visits = readings.map(reading => reading.probes.shop);

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
        '',
        'Shop: reCAPTCHA score per action',
        formatTable([header, ...actionRows, meanRow]),
        '',
        'Shop: how input arrived',
        formatTable([header, ...inputRows]),
    ];
}

function formatLeaks(readings: RunnerReadings[], header: string[]) {
    const byPage = readings.map(reading => new Map((reading.probes.leaks ?? []).map(result => [result.page, result])));
    const pages = [...new Set(byPage.flatMap(results => [...results.keys()]))];
    const verdictRows = pages.map(page => [page, ...byPage.map(results => results.get(page)?.verdict ?? '-')]);

    const checkLines = pages.flatMap(page => [
        page,
        ...readings.flatMap((reading, index) => {
            const result = byPage[index]?.get(page);
            return result ? [`  ${reading.runner}: ${formatLeakChecks(result)}`] : [];
        }),
    ]);

    return [
        '',
        'Leak pages: verdict',
        formatTable([header, ...verdictRows]),
        '',
        'Leak pages: failed checks',
        ...checkLines,
    ];
}

function formatLeakChecks(result: LeakPageResult) {
    if (result.error != null) {
        return `unknown: ${result.error}`;
    }
    const failed = result.failed.length > 0 ? result.failed.join(', ') : 'none';
    const details = Object.entries(result.details).map(([key, value]) => `${key}: ${value}`);
    return details.length > 0 ? `${failed} [${details.join('; ')}]` : failed;
}

function formatPanel(readings: RunnerReadings[], header: string[]) {
    const bySite = readings.map(
        reading => new Map((reading.probes.panel ?? []).map(result => [panelKey(result), result])),
    );
    const sites = [...new Set(bySite.flatMap(results => [...results.keys()]))];
    const outcomeRows = sites.map(site => [site, ...bySite.map(results => results.get(site)?.outcome ?? '-')]);

    const evidenceLines = sites.flatMap(site => [
        site,
        ...readings.flatMap((reading, index) => {
            const result = bySite[index]?.get(site);
            if (!result) {
                return [];
            }
            const cookies = result.vendorCookies.length > 0 ? result.vendorCookies.join(', ') : 'none';
            const seconds = (result.elapsedMs / 1000).toFixed(1);
            return [`  ${reading.runner}: ${result.evidence}; vendor cookies: ${cookies}; ${seconds} s`];
        }),
    ]);

    return ['', 'Panel: outcome', formatTable([header, ...outcomeRows]), '', 'Panel: evidence', ...evidenceLines];
}

/** A site's row label: its vendor and its host and path. */
function panelKey(result: PanelSiteResult) {
    const url = new URL(result.url);
    return `${result.vendor} ${url.host}${url.pathname === '/' ? '' : url.pathname}`;
}

function formatAllegro(readings: RunnerReadings[], header: string[]) {
    const runs = readings.map(reading => reading.probes.allegro);
    const rows = [
        ['interval', ...runs.map(run => (run ? `${run.intervalMs} ms` : '-'))],
        ['searches made', ...runs.map(run => (run ? `${run.searches.length} of ${run.cap}` : '-'))],
        [
            'with results',
            ...runs.map(run =>
                run ? String(run.searches.filter(search => search.outcome === 'results').length) : '-',
            ),
        ],
        [
            'before the first CAPTCHA',
            ...runs.map(run => {
                if (!run) {
                    return '-';
                }
                return run.searchesBeforeCaptcha == null ? 'no CAPTCHA' : String(run.searchesBeforeCaptcha);
            }),
        ],
        [
            'mean ms to results',
            ...runs.map(run => formatMean(run?.searches.flatMap(search => search.msToResults ?? []))),
        ],
    ];
    return ['', 'Allegro: searches until a CAPTCHA', formatTable([header, ...rows])];
}

function formatMean(values: number[] | undefined) {
    if (values == null || values.length === 0) {
        return '-';
    }
    let sum = 0;
    for (const value of values) {
        sum += value;
    }
    return String(Math.round(sum / values.length));
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
