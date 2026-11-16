import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { Clock } from '../utils/Clock.js';
import { BrowserService } from './BrowserService.js';
import type { CdpEvent } from './CdpTypes.js';
import type { CdpParams } from './checkCdpRequest.js';
import { readTargetInfo } from './readTargetInfo.js';

/** A client command the tunnel has allowed, before it is forwarded. */
export interface PacedCommand {
    method: string;
    params: CdpParams;
    sessionId?: string;
}

/** Whether a command may go to the browser now; a refusal carries the message the agent reads. */
export type PaceVerdict = { type: 'go' } | { type: 'refuse'; message: string };

/**
 * The human pace on every site the agent's browser visits (stealth-browsing D5), shared by every tunnel client since
 * a site sees one IP. Page loads and blocks are recognised passively from the browser's events; the pace never sends a
 * command of its own, so nothing of it is visible to a page.
 */
export interface BrowserPaceShape {
    /**
     * Resolves when a command that acts on a site may go: at once, or after holding it for its site's next slot (up to
     * 15 s), which it then reserves. A longer wait, a pause after a block or a stop after a second one resolves to a
     * refusal. Commands that do not act on a site go at once.
     */
    gate(command: PacedCommand): Promise<PaceVerdict>;
}

/** What the pace knows about one site. */
interface SiteState {
    /** The last page load on the site, or the slot reserved by the last command let through, whichever is later. */
    lastSlot?: number;
    /** Blocks within the last hour, oldest first. */
    blocks: number[];
    pausedUntil: number;
    doubledUntil: number;
    stoppedUntil: number;
}

/** What the pace knows about one page (or other target) of the browser. */
interface PageState {
    /** The URL the page shows, from its target info. */
    url?: string;
    /** The request id of the page's current main document: deduplicates its load across sessions. */
    loadId?: string;
    /** The main document that already counted as a block, so one block page counts once. */
    blockedLoadId?: string;
}

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const INTERVAL_MS = 5 * SECOND_MS;
/** The interval for an hour after a block. */
const DOUBLED_INTERVAL_MS = 2 * INTERVAL_MS;
const PAUSE_MS = 5 * MINUTE_MS;
/** The longest wait held silently; agent-browser gives a command 30 s. */
const MAX_HOLD_MS = 15 * SECOND_MS;
/** How long blocks are remembered, the doubled interval lasts, and a stop after a second block lasts. */
const BLOCK_MEMORY_MS = HOUR_MS;
/** Main-document statuses that are a block. */
const BLOCK_STATUSES = new Set([403, 429]);

export const BrowserPace = defineService({
    name: 'BrowserPace',
    deps: { browser: BrowserService, clock: Clock, logger: Logger },
    setup({ browser, clock, logger }): BrowserPaceShape {
        const { ownership } = browser;
        const sites = new Map<string, SiteState>();
        const pages = new Map<string, PageState>();

        browser.event.on(observe);
        browser.exited.on(() => pages.clear());

        return { gate };

        async function gate(command: PacedCommand): Promise<PaceVerdict> {
            const url = findTargetUrl(command);
            const site = url == null ? null : toSite(url);
            if (site == null) {
                return { type: 'go' };
            }
            const state = getSite(site);
            const now = clock.now();
            forgetOldBlocks(state, now);

            if (now < state.stoppedUntil) {
                logRefusal(command, site, 'stopped', state.stoppedUntil - now);
                return {
                    type: 'refuse',
                    message: `${site} blocked or challenged the agent twice within an hour, so poweragents has stopped acting on it for now. Ask the person to step in.`,
                };
            }
            const blocked = now < state.doubledUntil;
            const interval = blocked ? DOUBLED_INTERVAL_MS : INTERVAL_MS;
            const slot = Math.max(now, state.pausedUntil, state.lastSlot == null ? now : state.lastSlot + interval);
            const wait = slot - now;
            if (now < state.pausedUntil || wait > MAX_HOLD_MS) {
                logRefusal(command, site, now < state.pausedUntil ? 'paused' : 'busy', wait);
                const why = blocked
                    ? 'after it blocked or challenged the agent'
                    : `at one page load every ${interval / SECOND_MS} s`;
                return {
                    type: 'refuse',
                    message: `poweragents is pacing ${site} ${why}: the next action on it is possible in ${formatWait(wait)}. Work on something else meanwhile, or ask the person for help.`,
                };
            }

            state.lastSlot = slot;
            if (wait > 0) {
                logger.debug('A command waits for its site', { site, method: command.method, waitMs: wait });
                await new Promise<void>(resolve => {
                    clock.setTimeout(resolve, wait);
                });
            }
            return { type: 'go' };
        }

        /** The URL a command acts on: its target URL for a navigation, else the page of its session, if it acts at all. */
        function findTargetUrl({ method, params, sessionId }: PacedCommand) {
            switch (method) {
                case 'Page.navigate':
                case 'Target.createTarget':
                    return typeof params['url'] === 'string' ? params['url'] : undefined;
                case 'Page.reload':
                    return findSessionUrl(sessionId);
                case 'Input.dispatchMouseEvent': {
                    // A double click's second press belongs to the same action as its first.
                    const clickCount = params['clickCount'];
                    const isFirstPress = typeof clickCount !== 'number' || clickCount <= 1;
                    return params['type'] === 'mousePressed' && isFirstPress ? findSessionUrl(sessionId) : undefined;
                }
                case 'Input.dispatchKeyEvent': {
                    const isKeyDown = params['type'] === 'keyDown' || params['type'] === 'rawKeyDown';
                    return isKeyDown && params['key'] === 'Enter' ? findSessionUrl(sessionId) : undefined;
                }
                default:
                    return undefined;
            }
        }

        function findSessionUrl(sessionId: string | undefined) {
            const targetId = sessionId == null ? undefined : ownership.getSessionTarget(sessionId);
            return targetId == null ? undefined : pages.get(targetId)?.url;
        }

        function observe(event: CdpEvent) {
            const params = isPlainObject(event.params) ? event.params : {};
            switch (event.method) {
                case 'Target.targetCreated':
                case 'Target.targetInfoChanged': {
                    const info = readTargetInfo(params);
                    if (info) {
                        getPage(info.targetId).url = info.url;
                    }
                    return;
                }
                case 'Target.targetDestroyed':
                    if (typeof params['targetId'] === 'string') {
                        pages.delete(params['targetId']);
                    }
                    return;
                case 'Network.responseReceived':
                    onResponse(event.sessionId, params);
                    return;
                case 'Network.requestWillBeSent':
                    onRequest(event.sessionId, params);
                    break;
            }
        }

        /** A main-document response on an agent page is a page load, and a block when it is 403 or 429. */
        function onResponse(sessionId: string | undefined, params: CdpParams) {
            const targetId = findAgentPage(sessionId);
            const { requestId, response } = params;
            if (
                targetId == null ||
                params['type'] !== 'Document' ||
                // A page target's main frame has the target's id.
                params['frameId'] !== targetId ||
                typeof requestId !== 'string' ||
                !isPlainObject(response) ||
                typeof response['url'] !== 'string'
            ) {
                return;
            }
            const page = getPage(targetId);
            if (page.loadId === requestId) {
                return;
            }
            page.loadId = requestId;
            const site = toSite(response['url']);
            if (site == null) {
                return;
            }
            const state = getSite(site);
            const now = clock.now();
            state.lastSlot = Math.max(state.lastSlot ?? now, now);
            const status = response['status'];
            if (typeof status === 'number' && BLOCK_STATUSES.has(status)) {
                page.blockedLoadId = requestId;
                recordBlock(site, `status ${status}`);
            }
        }

        /** A request to a vendor's challenge on an agent page makes its current document a block page. */
        function onRequest(sessionId: string | undefined, params: CdpParams) {
            const targetId = findAgentPage(sessionId);
            const request = params['request'];
            if (targetId == null || !isPlainObject(request) || typeof request['url'] !== 'string') {
                return;
            }
            const vendor = findChallengeVendor(request['url']);
            const page = getPage(targetId);
            const site = page.url == null ? null : toSite(page.url);
            if (vendor == null || site == null || page.blockedLoadId === (page.loadId ?? '')) {
                return;
            }
            page.blockedLoadId = page.loadId ?? '';
            recordBlock(site, `${vendor} challenge`);
        }

        function recordBlock(site: string, reason: string) {
            const state = getSite(site);
            const now = clock.now();
            forgetOldBlocks(state, now);
            state.blocks.push(now);
            if (state.blocks.length >= 2) {
                state.stoppedUntil = now + BLOCK_MEMORY_MS;
            } else {
                state.pausedUntil = now + PAUSE_MS;
                state.doubledUntil = now + BLOCK_MEMORY_MS;
            }
            logger.info('A site showed a block', { site, reason, blocksWithinHour: state.blocks.length });
        }

        function logRefusal(command: PacedCommand, site: string, reason: string, waitMs: number) {
            logger.info('A command was refused to keep the pace', { site, method: command.method, reason, waitMs });
        }

        /** The page a session of an agent page is attached to; `undefined` for a session elsewhere. */
        function findAgentPage(sessionId: string | undefined) {
            const targetId = sessionId == null ? undefined : ownership.getSessionTarget(sessionId);
            return targetId != null && ownership.getTargetOwner(targetId) != null ? targetId : undefined;
        }

        function forgetOldBlocks(state: SiteState, now: number) {
            state.blocks = state.blocks.filter(at => now - at < BLOCK_MEMORY_MS);
        }

        function getSite(site: string) {
            let state = sites.get(site);
            if (!state) {
                state = { blocks: [], pausedUntil: 0, doubledUntil: 0, stoppedUntil: 0 };
                sites.set(site, state);
            }
            return state;
        }

        function getPage(targetId: string) {
            let page = pages.get(targetId);
            if (!page) {
                page = {};
                pages.set(targetId, page);
            }
            return page;
        }
    },
});

/** The site of an http(s) URL: its hostname without a leading `www.`; `null` for any other URL. */
function toSite(url: string) {
    const parsed = URL.parse(url);
    if (parsed == null || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
        return null;
    }
    return parsed.hostname.replace(/^www\./, '');
}

/**
 * The vendor whose challenge a request loads; `null` for an ordinary request. Markers from the sites the stealth
 * eval's panel decided (`stealthEval/panel.ts`). reCAPTCHA and Turnstile are not markers: ordinary forms use them.
 */
function findChallengeVendor(url: string) {
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

function isHostOf(hostname: string, domain: string) {
    return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** A wait in words: seconds under a minute, else whole minutes, rounded up. */
function formatWait(ms: number) {
    return ms < MINUTE_MS ? `${Math.ceil(ms / SECOND_MS)} s` : `${Math.ceil(ms / MINUTE_MS)} min`;
}
