/**
 * A boolean property of a value parsed from JSON, or `undefined` when it is missing or not a boolean.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function readBoolean(value: object, key: string): boolean | undefined {
    const property: unknown = Reflect.get(value, key);
    return typeof property === 'boolean' ? property : undefined;
}
