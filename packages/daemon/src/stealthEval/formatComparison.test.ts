import { expect, test } from 'bun:test';

import { formatComparison } from './formatComparison.js';
import type { RunResult, ShopAction, ShopClickRecord, ShopInputRecord } from './StealthEvalTypes.js';

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
        'agent: 2026-11-15T18:00:00.000Z, Chrome/157',
        'person: 2026-11-15T18:00:00.000Z, Chrome/157',
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

test('a run whose shop probe failed shows its error and dashes', () => {
    const failedRun: RunResult = {
        ...run('headless', { actions: [], input: [] }),
        probes: {},
        probeErrors: { shop: 'Step 2 failed' },
    };

    const output = formatComparison([failedRun]);

    expect(output).toContain('headless: 2026-11-15T18:00:00.000Z, Chrome/157, shop failed: Step 2 failed');
    expect(output).toContain('\nmean         -\n');
    expect(output).toContain('clicks                                     -');
});

/** The parts of a visit a test varies. */
interface VisitParts {
    actions: ShopAction[];
    input: ShopInputRecord[];
}

function run(runner: RunResult['runner'], parts: VisitParts): RunResult {
    return {
        runner,
        startedAt: '2026-11-15T18:00:00.000Z',
        finishedAt: '2026-11-15T18:05:00.000Z',
        browserVersion: 'Chrome/157',
        probes: { shop: { version: 1, visitId: runner, startedAt: 's', userAgent: 'ua', ...parts } },
        probeErrors: {},
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
