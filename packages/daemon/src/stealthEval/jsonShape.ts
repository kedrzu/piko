import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

// Checks on parsed JSON for the eval's readers: each returns the value typed or throws `<at> <problem>`, so the reader
// can say which field of which document did not fit.

/** @__NO_SIDE_EFFECTS__ */
export function asObject(value: unknown, at: string) {
    if (!isPlainObject(value)) {
        throw invalidShape(at, 'is not an object');
    }
    return value;
}

/** @__NO_SIDE_EFFECTS__ */
export function asArray(value: unknown, at: string): unknown[] {
    if (!Array.isArray(value)) {
        throw invalidShape(at, 'is not an array');
    }
    return value;
}

/** @__NO_SIDE_EFFECTS__ */
export function asString(value: unknown, at: string) {
    if (typeof value !== 'string') {
        throw invalidShape(at, 'is not a string');
    }
    return value;
}

/** @__NO_SIDE_EFFECTS__ */
export function asNullableString(value: unknown, at: string) {
    return value === null ? null : asString(value, at);
}

/** @__NO_SIDE_EFFECTS__ */
export function asBoolean(value: unknown, at: string) {
    if (typeof value !== 'boolean') {
        throw invalidShape(at, 'is not a boolean');
    }
    return value;
}

/** @__NO_SIDE_EFFECTS__ */
export function asNumber(value: unknown, at: string) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw invalidShape(at, 'is not a number');
    }
    return value;
}

/** @__NO_SIDE_EFFECTS__ */
export function asNullableNumber(value: unknown, at: string) {
    return value === null ? null : asNumber(value, at);
}

/**
 * A list of strings.
 * @__NO_SIDE_EFFECTS__
 */
export function asStringArray(value: unknown, at: string) {
    return asArray(value, at).map((item, index) => asString(item, `${at}[${index}]`));
}

/**
 * One of `options`.
 * @__NO_SIDE_EFFECTS__
 */
export function asOneOf<T extends string>(value: unknown, options: readonly T[], at: string): T {
    const option = options.find(candidate => candidate === value);
    if (option == null) {
        throw invalidShape(at, `is not one of ${options.join(', ')}`);
    }
    return option;
}

/**
 * The error the checks throw.
 * @__NO_SIDE_EFFECTS__
 */
export function invalidShape(at: string, problem: string) {
    return new Error(`${at} ${problem}`);
}
