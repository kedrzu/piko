import { expect, test } from 'bun:test';

import { parseShopVisit } from './parseShopVisit.js';
import type { ShopVisit } from './StealthEvalTypes.js';

const VISIT: ShopVisit = {
    version: 1,
    visitId: 'v1',
    startedAt: '2026-11-15T18:00:00.000Z',
    userAgent: 'Mozilla/5.0 Chrome/142.0.0.0',
    actions: [
        { action: 'page_list', page: 'list', at: 'a', score: 0.9, reasons: [], valid: true, error: null },
        { action: 'search', page: 'list', at: 'b', score: null, reasons: [], valid: null, error: 'expired' },
    ],
    input: [
        {
            kind: 'click',
            at: 'c',
            target: 'button#cookie-accept',
            isTrusted: true,
            pointerType: 'mouse',
            mouseMovesBefore: 12,
            pathPxBefore: 340.5,
            msSinceLastMove: null,
            offsetFromCenter: { x: -3.5, y: 1 },
        },
        {
            kind: 'text',
            at: 'd',
            target: 'input#search-input',
            chars: 7,
            keydowns: 7,
            inputEvents: 7,
            insertTextWithoutKey: 0,
            pastes: 0,
            meanKeyIntervalMs: 140,
            minKeyIntervalMs: null,
        },
        { kind: 'scroll', at: 'e', page: 'product', wheelEvents: 9, scrollEvents: 30, maxScrollPct: 88 },
    ],
};

test('a pasted visit parses back to the same visit, without fields the eval does not know', () => {
    const pasted: unknown = JSON.parse(JSON.stringify({ ...VISIT, extra: 'dropped' }));

    expect(parseShopVisit(pasted)).toEqual(VISIT);
});

test('a visit that does not fit is refused, naming the field', () => {
    expect(() => parseShopVisit('not json object')).toThrow('Invalid shop results: results is not an object');
    expect(() => parseShopVisit({ ...VISIT, version: 2 })).toThrow('version is not 1');
    expect(() => parseShopVisit({ ...VISIT, actions: [{ ...VISIT.actions[0], score: '0.9' }] })).toThrow(
        'actions[0].score is not a number',
    );
    expect(() => parseShopVisit({ ...VISIT, actions: [{ ...VISIT.actions[0], valid: 'yes' }] })).toThrow(
        'actions[0].valid is neither a boolean nor null',
    );
    expect(() => parseShopVisit({ ...VISIT, input: [{ kind: 'hover' }] })).toThrow(
        'input[0].kind is not click, text or scroll',
    );
    expect(() => parseShopVisit({ ...VISIT, input: [{ ...VISIT.input[1], keydowns: null }] })).toThrow(
        'input[0].keydowns is not a number',
    );
});
