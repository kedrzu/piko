/** What the agent's browser is launched with, beyond what `@nzyme/stealth-browser` adds itself. */
export interface BuildChromiumArgsOptions {
    /** The loopback port of `BrowserNetworkGuard`, the only way out for the browser's traffic. */
    proxyPort: number;
    /** Appended last; tests pass `--headless=new`. */
    extraArgs?: string[];
}

/**
 * The product's part of the browser's command line; `launchStealthBrowser` adds the pipe, the profile, the first-run
 * flags, `AutomationControlled` and the macOS mock keychain. No window at start, and every request through the
 * daemon's proxy: `<-loopback>` removes the proxy's implicit bypass of loopback, so `localhost` goes to the proxy too
 * and is refused there; WebRTC may use UDP only through the proxy, which has none, and QUIC is off because the proxy
 * carries no UDP.
 * `PaintHolding` off: after a navigation Chrome drops input until the new page is first painted, and a page in a
 * minimized window is never painted, so without it the agent's clicks and keys would never reach a page it opened
 * (checked 2026-11-14 on Chrome for Testing 157: a click on a minimized example.com lands only with it disabled).
 * Every agent page lives in a hidden window, so the background throttling of timers, occluded windows and renderers is
 * off too (the flags Playwright launches with): a page works as it would in front, and still renders for a thumbnail.
 * @__NO_SIDE_EFFECTS__
 */
export function buildChromiumArgs(options: BuildChromiumArgsOptions) {
    return [
        '--no-startup-window',
        `--proxy-server=http://127.0.0.1:${options.proxyPort}`,
        '--proxy-bypass-list=<-loopback>',
        '--disable-quic',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--disable-features=PaintHolding',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        ...(options.extraArgs ?? []),
    ];
}
