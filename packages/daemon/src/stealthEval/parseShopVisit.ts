import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { ShopAction, ShopInputRecord, ShopVisit } from './StealthEvalTypes.js';

/**
 * Checks that a value is the test shop's visit as `#eval-results` holds it (the person pastes it, the drivers read it)
 * and returns a typed copy of the known fields; throws naming the first field that does not fit.
 * @__NO_SIDE_EFFECTS__
 */
export function parseShopVisit(value: unknown): ShopVisit {
    const visit = asObject(value, 'results');
    if (visit['version'] !== 1) {
        throw invalid('version', 'is not 1');
    }
    return {
        version: 1,
        visitId: asString(visit['visitId'], 'visitId'),
        startedAt: asString(visit['startedAt'], 'startedAt'),
        userAgent: asString(visit['userAgent'], 'userAgent'),
        actions: asArray(visit['actions'], 'actions').map((action, index) => parseAction(action, `actions[${index}]`)),
        input: asArray(visit['input'], 'input').map((record, index) => parseInputRecord(record, `input[${index}]`)),
    };
}

function parseAction(value: unknown, at: string): ShopAction {
    const action = asObject(value, at);
    const valid = action['valid'];
    if (valid !== null && typeof valid !== 'boolean') {
        throw invalid(`${at}.valid`, 'is neither a boolean nor null');
    }
    return {
        action: asString(action['action'], `${at}.action`),
        page: asString(action['page'], `${at}.page`),
        at: asString(action['at'], `${at}.at`),
        score: asNullableNumber(action['score'], `${at}.score`),
        reasons: asArray(action['reasons'], `${at}.reasons`).map((reason, index) =>
            asString(reason, `${at}.reasons[${index}]`),
        ),
        valid,
        error: action['error'] === null ? null : asString(action['error'], `${at}.error`),
    };
}

function parseInputRecord(value: unknown, at: string): ShopInputRecord {
    const record = asObject(value, at);
    const kind = record['kind'];
    switch (kind) {
        case 'click': {
            const offset = asObject(record['offsetFromCenter'], `${at}.offsetFromCenter`);
            if (typeof record['isTrusted'] !== 'boolean') {
                throw invalid(`${at}.isTrusted`, 'is not a boolean');
            }
            return {
                kind,
                at: asString(record['at'], `${at}.at`),
                target: asString(record['target'], `${at}.target`),
                isTrusted: record['isTrusted'],
                pointerType: asString(record['pointerType'], `${at}.pointerType`),
                mouseMovesBefore: asNumber(record['mouseMovesBefore'], `${at}.mouseMovesBefore`),
                pathPxBefore: asNumber(record['pathPxBefore'], `${at}.pathPxBefore`),
                msSinceLastMove: asNullableNumber(record['msSinceLastMove'], `${at}.msSinceLastMove`),
                offsetFromCenter: {
                    x: asNumber(offset['x'], `${at}.offsetFromCenter.x`),
                    y: asNumber(offset['y'], `${at}.offsetFromCenter.y`),
                },
            };
        }
        case 'text':
            return {
                kind,
                at: asString(record['at'], `${at}.at`),
                target: asString(record['target'], `${at}.target`),
                chars: asNumber(record['chars'], `${at}.chars`),
                keydowns: asNumber(record['keydowns'], `${at}.keydowns`),
                inputEvents: asNumber(record['inputEvents'], `${at}.inputEvents`),
                insertTextWithoutKey: asNumber(record['insertTextWithoutKey'], `${at}.insertTextWithoutKey`),
                pastes: asNumber(record['pastes'], `${at}.pastes`),
                meanKeyIntervalMs: asNullableNumber(record['meanKeyIntervalMs'], `${at}.meanKeyIntervalMs`),
                minKeyIntervalMs: asNullableNumber(record['minKeyIntervalMs'], `${at}.minKeyIntervalMs`),
            };
        case 'scroll':
            return {
                kind,
                at: asString(record['at'], `${at}.at`),
                page: asString(record['page'], `${at}.page`),
                wheelEvents: asNumber(record['wheelEvents'], `${at}.wheelEvents`),
                scrollEvents: asNumber(record['scrollEvents'], `${at}.scrollEvents`),
                maxScrollPct: asNumber(record['maxScrollPct'], `${at}.maxScrollPct`),
            };
        default:
            throw invalid(`${at}.kind`, 'is not click, text or scroll');
    }
}

function asObject(value: unknown, at: string) {
    if (!isPlainObject(value)) {
        throw invalid(at, 'is not an object');
    }
    return value;
}

function asArray(value: unknown, at: string): unknown[] {
    if (!Array.isArray(value)) {
        throw invalid(at, 'is not an array');
    }
    return value;
}

function asString(value: unknown, at: string) {
    if (typeof value !== 'string') {
        throw invalid(at, 'is not a string');
    }
    return value;
}

function asNumber(value: unknown, at: string) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw invalid(at, 'is not a number');
    }
    return value;
}

function asNullableNumber(value: unknown, at: string) {
    return value === null ? null : asNumber(value, at);
}

function invalid(at: string, problem: string) {
    return new Error(`Invalid shop results: ${at} ${problem}`);
}
