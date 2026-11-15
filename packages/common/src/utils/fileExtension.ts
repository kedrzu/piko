/**
 * A project file's extension, lower case and without the dot (`notes/Plan.MD` is `md`); empty when its name has none,
 * also for a hidden name like `.env`.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function fileExtension(path: string): string {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}
