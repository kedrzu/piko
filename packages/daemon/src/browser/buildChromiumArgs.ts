/** What the agent's browser is launched with. */
export interface BuildChromiumArgsOptions {
    /** The profile folder: cookies and logins, shared by every conversation. */
    userDataDir: string;
    /** The loopback port of `BrowserNetworkGuard`, the only way out for the browser's traffic. */
    proxyPort: number;
    /** Appended last; tests pass `--headless=new`. */
    extraArgs?: string[];
}

/**
 * The browser's command line: driven over the pipe only (no debugging port), no window at start, and every request
 * through the daemon's proxy. `<-loopback>` removes the proxy's implicit bypass of loopback, so `localhost` goes to the
 * proxy too and is refused there; WebRTC may use UDP only through the proxy, which has none, and QUIC is off because the
 * proxy carries no UDP. `--use-mock-keychain` keeps the macOS Keychain out: without it the first network request waits
 * on a Keychain access prompt for the cookie key, which either steals focus or, from a background daemon, never
 * resolves; the profile's cookies are then protected by the private folder they live in, not by the Keychain.
 * `PaintHolding` off: after a navigation Chrome drops input until the new page is first painted, and a page in a
 * minimized window is never painted, so without it the agent's clicks and keys would never reach a page it opened
 * (checked 2026-11-14 on Chrome for Testing 157: a click on a minimized example.com lands only with it disabled).
 * Every agent page lives in a hidden window, so the background throttling of timers, occluded windows and renderers is
 * off too (the flags Playwright launches with): a page works as it would in front, and still renders for a thumbnail.
 * @__NO_SIDE_EFFECTS__
 */
export function buildChromiumArgs(options: BuildChromiumArgsOptions) {
    return [
        `--user-data-dir=${options.userDataDir}`,
        '--remote-debugging-pipe',
        '--no-startup-window',
        '--no-first-run',
        '--no-default-browser-check',
        `--proxy-server=http://127.0.0.1:${options.proxyPort}`,
        '--proxy-bypass-list=<-loopback>',
        '--disable-quic',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--use-mock-keychain',
        '--disable-features=PaintHolding',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        ...(options.extraArgs ?? []),
    ];
}
