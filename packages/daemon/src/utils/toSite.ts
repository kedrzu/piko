/**
 * The site of an http(s) URL, as the agent's browser paces it: its hostname without a trailing root dot or a leading
 * `www.` (`www.example.com.` is `example.com`); `null` for any other URL.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function toSite(url: string) {
    const parsed = URL.parse(url);
    if (parsed == null || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
        return null;
    }
    return parsed.hostname.replace(/\.$/, '').replace(/^www\./, '');
}
