/**
 * Whether a property of a value parsed from JSON is missing or of the given type, so a wrong type is told apart from
 * an absent key, which `readString` and `readBoolean` both report as `undefined`.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function isOptionalProperty(value: object, key: string, type: 'string' | 'boolean'): boolean {
    const property: unknown = Reflect.get(value, key);
    return property === undefined || typeof property === type;
}
