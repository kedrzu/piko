/**
 * A list of ids kept in `localStorage` as JSON; `null` when nothing, or something else, is stored. Entries that are not
 * strings are dropped.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseStoredIds(stored: string | null) {
    if (stored === null) {
        return null;
    }
    let value: unknown;
    try {
        value = JSON.parse(stored);
    } catch {
        return null;
    }
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : null;
}
