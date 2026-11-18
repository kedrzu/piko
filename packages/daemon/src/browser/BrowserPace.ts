import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { createSitePace } from '@nzyme/stealth-browser';
import type { SitePace } from '@nzyme/stealth-browser';

import { Clock } from '../utils/Clock.js';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

/**
 * The human pace on every site the agent's browser visits (stealth-browsing D5), shared by every tunnel client since a
 * site sees one IP. One for the daemon's lifetime, handed to every launch of the browser, so a site that blocked the
 * agent stays paused across a relaunch. Its refusals tell the agent what to do next.
 */
export const BrowserPace = defineService({
    name: 'BrowserPace',
    deps: { clock: Clock, logger: Logger },
    setup({ clock, logger }): SitePace {
        return createSitePace({
            clock,
            logger,
            messages: {
                paused: (site, waitMs, afterBlock, intervalMs) =>
                    `poweragents is pacing ${site} ${afterBlock ? 'after it blocked or challenged the agent' : `at one page load every ${intervalMs / SECOND_MS} s`}: the next action on it is possible in ${formatWait(waitMs)}. Work on something else meanwhile, or ask the person for help.`,
                stopped: site =>
                    `${site} blocked or challenged the agent twice within an hour, so poweragents has stopped acting on it for now. Ask the person to step in.`,
            },
        });
    },
});

/** A wait in words: seconds under a minute, else whole minutes, rounded up. */
function formatWait(ms: number) {
    return ms < MINUTE_MS ? `${Math.ceil(ms / SECOND_MS)} s` : `${Math.ceil(ms / MINUTE_MS)} min`;
}
