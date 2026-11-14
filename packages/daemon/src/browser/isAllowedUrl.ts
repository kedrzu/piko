/** The only non-web page the agent may open: a blank page, the agent's CLI's first page. */
const BLANK_PAGE = 'about:blank';

/**
 * Whether the agent's browser may navigate to `url`: an `http:` or `https:` URL (any scheme casing, as `URL` lowercases
 * it), or exactly `about:blank`. Everything else is refused — `file:`, `chrome:`, `devtools:`, `data:`, `javascript:`,
 * `blob:` and the like, a non-string, a string with surrounding whitespace (`URL` would trim it, Chrome's parser need
 * not agree), and any other `about:` form: `about:blank#x`, `about:blank?x` and `ABOUT:BLANK` load the same blank page,
 * but nothing the agent does needs them, so only the one exact spelling passes.
 * @__NO_SIDE_EFFECTS__
 */
export function isAllowedUrl(url: unknown): boolean {
    if (typeof url !== 'string' || url !== url.trim()) {
        return false;
    }
    if (url === BLANK_PAGE) {
        return true;
    }
    const parsed = URL.parse(url);
    return parsed?.protocol === 'http:' || parsed?.protocol === 'https:';
}
