import { expect, test } from 'bun:test';

import { formatComparison } from './formatComparison.js';
import type { ReadingSource, RunnerReadings } from './runResultFiles.js';
import type {
    LeakPageResult,
    PanelSiteResult,
    RunnerName,
    ShopAction,
    ShopClickRecord,
    ShopInputRecord,
} from './StealthEvalTypes.js';

test('repeated actions line up by occurrence, with each runner mean and input summary', () => {
    const agent = run('agent', {
        actions: [action('page_list', 0.9), action('search', 0.7), action('page_list', 0.3), pending('faq')],
        input: [click(0, true), click(5, true), click(0, false), text(0, 6, 0), text(4, 4, 1)],
    });
    const person = run('person', {
        actions: [action('page_list', 0.9), action('page_list', 0.9), failed('search')],
        input: [{ ...click(30, true), pathPxBefore: 412.5, offsetFromCenter: { x: -4, y: 2.5 } }],
    });

    const expected = [
        'agent shop: 2026-11-15T18:00:00.000Z, Chrome/157',
        'person shop: 2026-11-15T18:00:00.000Z, Chrome/157',
        '',
        'Shop: reCAPTCHA score per action',
        '                agent  person',
        'page_list        0.90    0.90',
        'search           0.70   error',
        'page_list #2     0.30    0.90',
        'faq           pending       -',
        'mean             0.63    0.90',
        '',
        'Shop: how input arrived',
        '                                    agent  person',
        'clicks                                  3       1',
        'clicks with no mouse move before        2       0',
        'clicks with no mouse path before        3       0',
        'clicks at the exact centre              3       0',
        'untrusted clicks                        1       0',
        'text fields                             2       0',
        'text fields typed with no keydowns      1       0',
        'pastes                                  1       0',
    ].join('\n');
    expect(formatComparison([agent, person])).toBe(expected);
});

test('a runner whose shop probe failed shows its error and dashes', () => {
    const failedRun: RunnerReadings = {
        ...run('headless', { actions: [], input: [] }),
        probes: {},
        probeErrors: { shop: 'Step 2 failed' },
    };

    const output = formatComparison([failedRun]);

    expect(output).toContain('headless shop: 2026-11-15T18:00:00.000Z, Chrome/157, failed: Step 2 failed');
    expect(output).toContain('\nmean         -\n');
    expect(output).toContain('clicks                                     -');
});

test('leaks, panel and Allegro line up per page and site, and a probe no runner has is left out', () => {
    const agent: RunnerReadings = {
        runner: 'agent',
        probes: {
            leaks: [leak('rebrowser', 'fail', ['useragent'], { warnings: 'viewport' }), leak('botd', 'pass', [])],
            panel: [panel('https://www.indeed.com/', 'through', [])],
            allegro: {
                intervalMs: 8000,
                cap: 40,
                consentAccepted: true,
                searches: [search(1000, 'results'), search(3000, 'results'), search(null, 'captcha')],
                searchesBeforeCaptcha: 2,
            },
        },
        probeErrors: {},
        sources: { leaks: SOURCE, panel: SOURCE, allegro: SOURCE },
    };
    const headless: RunnerReadings = {
        runner: 'headless',
        probes: {
            leaks: [
                { ...leak('rebrowser', 'unknown', []), error: 'the page did not finish its checks in 30000 ms' },
                leak('botd', 'fail', ['detectWebDriver'], { botKind: 'headless_chrome' }),
            ],
            panel: [panel('https://www.indeed.com/', 'challenged', ['__cf_bm'])],
        },
        probeErrors: {},
        sources: { leaks: SOURCE, panel: SOURCE },
    };

    const expected = [
        'agent leaks: 2026-11-15T18:00:00.000Z, Chrome/157',
        'agent panel: 2026-11-15T18:00:00.000Z, Chrome/157',
        'agent allegro: 2026-11-15T18:00:00.000Z, Chrome/157',
        'headless leaks: 2026-11-15T18:00:00.000Z, Chrome/157',
        'headless panel: 2026-11-15T18:00:00.000Z, Chrome/157',
        '',
        'Leak pages: verdict',
        '           agent  headless',
        'rebrowser   fail   unknown',
        'botd        pass      fail',
        '',
        'Leak pages: failed checks',
        'rebrowser',
        '  agent: useragent [warnings: viewport]',
        '  headless: unknown: the page did not finish its checks in 30000 ms',
        'botd',
        '  agent: none',
        '  headless: detectWebDriver [botKind: headless_chrome]',
        '',
        'Panel: outcome',
        '                             agent    headless',
        'Cloudflare www.indeed.com  through  challenged',
        '',
        'Panel: evidence',
        'Cloudflare www.indeed.com',
        '  agent: marker; vendor cookies: none; 12.3 s',
        '  headless: marker; vendor cookies: __cf_bm; 12.3 s',
        '',
        'Allegro: searches until a CAPTCHA',
        '                            agent  headless',
        'interval                  8000 ms         -',
        'searches made             3 of 40         -',
        'with results                    2         -',
        'before the first CAPTCHA        2         -',
        'mean ms to results           2000         -',
    ].join('\n');
    expect(formatComparison([agent, headless])).toBe(expected);
});

/** The parts of a visit a test varies. */
interface VisitParts {
    actions: ShopAction[];
    input: ShopInputRecord[];
}

function run(runner: RunnerName, parts: VisitParts): RunnerReadings {
    return {
        runner,
        probes: { shop: { version: 1, visitId: runner, startedAt: 's', userAgent: 'ua', ...parts } },
        probeErrors: {},
        sources: { shop: SOURCE },
    };
}

function action(name: string, score: number): ShopAction {
    return { action: name, page: 'list', at: 'a', score, reasons: [], valid: true, error: null };
}

function pending(name: string): ShopAction {
    return { action: name, page: 'list', at: 'a', score: null, reasons: [], valid: null, error: null };
}

function failed(name: string): ShopAction {
    return { action: name, page: 'list', at: 'a', score: null, reasons: [], valid: null, error: 'expired' };
}

function click(mouseMovesBefore: number, isTrusted: boolean): ShopClickRecord {
    return {
        kind: 'click',
        at: 'a',
        target: 'button',
        isTrusted,
        pointerType: 'mouse',
        mouseMovesBefore,
        pathPxBefore: 0,
        msSinceLastMove: null,
        offsetFromCenter: { x: 0, y: 0 },
    };
}

function text(keydowns: number, chars: number, pastes: number): ShopInputRecord {
    return {
        kind: 'text',
        at: 'a',
        target: 'input',
        chars,
        keydowns,
        inputEvents: chars,
        insertTextWithoutKey: 0,
        pastes,
        meanKeyIntervalMs: null,
        minKeyIntervalMs: null,
    };
}

const SOURCE: ReadingSource = { startedAt: '2026-11-15T18:00:00.000Z', browserVersion: 'Chrome/157' };

function leak(
    page: string,
    verdict: LeakPageResult['verdict'],
    failedChecks: string[],
    details: Record<string, string> = {},
): LeakPageResult {
    return { page, url: `https://${page}.test/`, verdict, failed: failedChecks, details, error: null };
}

function panel(url: string, outcome: PanelSiteResult['outcome'], vendorCookies: string[]): PanelSiteResult {
    return { vendor: 'Cloudflare', url, outcome, evidence: 'marker', title: 't', vendorCookies, elapsedMs: 12_300 };
}

function search(msToResults: number | null, outcome: 'results' | 'captcha') {
    return { query: 'q', at: 'a', msToResults, outcome, detail: null };
}
