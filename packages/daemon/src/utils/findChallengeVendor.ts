import { isHostOf } from './isHostOf.js';

/**
 * The vendor whose challenge a request loads; `null` for an ordinary request. Markers from the sites the stealth
 * eval's panel decided (`stealthEval/panel.ts`). reCAPTCHA and Turnstile are not markers: ordinary forms use them.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function findChallengeVendor(url: string) {
    const parsed = URL.parse(url);
    if (parsed == null) {
        return null;
    }
    const { hostname, pathname } = parsed;
    if (isHostOf(hostname, 'captcha-delivery.com')) {
        return 'DataDome';
    }
    // An ordinary page behind Cloudflare loads `/cdn-cgi/challenge-platform/scripts/jsd/main.js`, with no orchestrate.
    if (pathname.includes('/cdn-cgi/challenge-platform/') && pathname.includes('/orchestrate/')) {
        return 'Cloudflare';
    }
    if (
        hostname === 'captcha.px-cdn.net' ||
        ((isHostOf(hostname, 'perimeterx.net') || isHostOf(hostname, 'px-cdn.net')) && pathname.includes('/captcha'))
    ) {
        return 'HUMAN';
    }
    return null;
}
