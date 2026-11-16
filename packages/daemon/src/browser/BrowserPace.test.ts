import { expect, test } from 'bun:test';

import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';

import { Clock } from '../utils/Clock.js';
import { BrowserPace } from './BrowserPace.js';
import type { PacedCommand, PaceVerdict } from './BrowserPace.js';
import { BrowserService } from './BrowserService.js';
import type { BrowserServiceShape } from './BrowserService.js';
import type { CdpEvent } from './CdpTypes.js';
import { createTargetOwnership } from './createTargetOwnership.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

test('a second load of a site waits out 5 s from the first, other sites go at once, www. is the same site', async () => {
    const { pace, clock, emit } = setup();
    emit(pageUrl('T1', 'https://www.shop.pl/'));
    emit(documentResponse('S1', 'T1', 'L1', 'https://www.shop.pl/', 200));

    clock.advance(2 * SECOND);
    const held = track(pace.gate(navigate('https://shop.pl/search')));
    expect(await track(pace.gate(navigate('https://other.pl/'))).settled()).toEqual({ type: 'go' });
    expect(await held.settled()).toBeUndefined();
    clock.advance(3 * SECOND - 1);
    expect(await held.settled()).toBeUndefined();
    clock.advance(1);
    expect(await held.settled()).toEqual({ type: 'go' });
});

test('commands let through together take one slot each, and a wait over 15 s is refused', async () => {
    const { pace, clock, logs } = setup();
    const gates = [1, 2, 3, 4].map(() => track(pace.gate(navigate('https://shop.pl/'))));
    const refused = await pace.gate(navigate('https://shop.pl/'));

    expect(refused).toEqual({
        type: 'refuse',
        message:
            'poweragents is pacing shop.pl at one page load every 5 s: the next action on it is possible in 20 s. Work on something else meanwhile, or ask the person for help.',
    });
    expect(await gates[0]!.settled()).toEqual({ type: 'go' });
    for (const gate of gates.slice(1)) {
        clock.advance(5 * SECOND - 1);
        expect(await gate.settled()).toBeUndefined();
        clock.advance(1);
        expect(await gate.settled()).toEqual({ type: 'go' });
    }
    expect(logs.filter(log => log.message === 'A command was refused to keep the pace').map(log => log.data)).toEqual([
        { site: 'shop.pl', method: 'Page.navigate', reason: 'busy', waitMs: 20 * SECOND },
    ]);
});

test('a block pauses its site for 5 minutes, then doubles the interval for the rest of the hour', async () => {
    const { pace, clock, emit, logs } = setup();
    emit(pageUrl('T1', 'https://shop.pl/'));
    // Two sessions on the page both report the load: still one block.
    emit(documentResponse('S1', 'T1', 'L1', 'https://shop.pl/', 403));
    emit(documentResponse('S2', 'T1', 'L1', 'https://shop.pl/', 403));

    clock.advance(MINUTE);
    expect(await pace.gate(navigate('https://shop.pl/'))).toEqual({
        type: 'refuse',
        message:
            'poweragents is pacing shop.pl after it blocked or challenged the agent: the next action on it is possible in 4 min. Work on something else meanwhile, or ask the person for help.',
    });
    expect(await track(pace.gate(navigate('https://other.pl/'))).settled()).toEqual({ type: 'go' });

    clock.advance(4 * MINUTE);
    expect(await track(pace.gate(navigate('https://shop.pl/'))).settled()).toEqual({ type: 'go' });
    const doubled = track(pace.gate(navigate('https://shop.pl/')));
    clock.advance(10 * SECOND - 1);
    expect(await doubled.settled()).toBeUndefined();
    clock.advance(1);
    expect(await doubled.settled()).toEqual({ type: 'go' });

    clock.advance(55 * MINUTE);
    expect(await track(pace.gate(navigate('https://shop.pl/'))).settled()).toEqual({ type: 'go' });
    const normal = track(pace.gate(navigate('https://shop.pl/')));
    clock.advance(5 * SECOND);
    expect(await normal.settled()).toEqual({ type: 'go' });
    expect(logs.filter(log => log.message === 'A site showed a block').map(log => log.data)).toEqual([
        { site: 'shop.pl', reason: 'status 403', blocksWithinHour: 1 },
    ]);
});

test('a second block within the hour stops the site until an hour after it, then it is forgotten', async () => {
    const { pace, clock, emit } = setup();
    emit(pageUrl('T1', 'https://shop.pl/'));
    emit(documentResponse('S1', 'T1', 'L1', 'https://shop.pl/', 429));
    clock.advance(30 * MINUTE);
    emit(documentResponse('S1', 'T1', 'L2', 'https://shop.pl/', 403));

    const stopped: PaceVerdict = {
        type: 'refuse',
        message:
            'shop.pl blocked or challenged the agent twice within an hour, so poweragents has stopped acting on it for now. Ask the person to step in.',
    };
    expect(await pace.gate(navigate('https://shop.pl/'))).toEqual(stopped);
    // The first block is an hour old here; the stop still runs from the second.
    clock.advance(45 * MINUTE);
    expect(await pace.gate(navigate('https://shop.pl/'))).toEqual(stopped);
    clock.advance(15 * MINUTE);
    expect(await track(pace.gate(navigate('https://shop.pl/'))).settled()).toEqual({ type: 'go' });
});

test("a vendor's challenge request blocks the page's site once per document; ordinary scripts do not", async () => {
    const { pace, clock, emit } = setup();
    emit(pageUrl('T1', 'https://shop.pl/'));
    emit(documentResponse('S1', 'T1', 'L1', 'https://shop.pl/', 200));
    for (const url of [
        'https://shop.pl/cdn-cgi/challenge-platform/scripts/jsd/main.js',
        'https://www.google.com/recaptcha/api.js',
        'https://challenges.cloudflare.com/turnstile/v0/api.js',
        'https://client.perimeterx.net/PXabc/main.min.js',
    ]) {
        emit(request('S1', url));
    }
    clock.advance(5 * SECOND);
    expect(await track(pace.gate(navigate('https://shop.pl/'))).settled()).toEqual({ type: 'go' });

    emit(documentResponse('S1', 'T1', 'L2', 'https://shop.pl/', 200));
    emit(request('S1', 'https://geo.captcha-delivery.com/captcha/?initialCid=x'));
    emit(request('S1', 'https://ct.captcha-delivery.com/c.js'));
    clock.advance(SECOND);
    const verdict = await pace.gate(navigate('https://shop.pl/'));
    expect(verdict.type === 'refuse' ? verdict.message : undefined).toContain(
        'after it blocked or challenged the agent',
    );

    for (const url of [
        'https://shop.pl/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1?ray=1',
        'https://captcha.px-cdn.net/PXabc/captcha.js',
        'https://collector-pxabc.px-cdn.net/captcha/x',
    ]) {
        const { pace: other, emit: emitOther } = setup();
        emitOther(pageUrl('T1', 'https://shop.pl/'));
        emitOther(documentResponse('S1', 'T1', 'L1', 'https://shop.pl/', 200));
        emitOther(request('S1', url));
        expect(await other.gate(navigate('https://shop.pl/'))).toMatchObject({ type: 'refuse' });
    }
});

test("loads of a subframe or of a page no conversation owns don't count", async () => {
    const { pace, emit, ownership } = setup();
    ownership.claimSession({ type: 'daemon' }, 'S9', 'T9');
    emit(documentResponse('S1', 'T1', 'L1', 'https://shop.pl/', 403, 'FRAME'));
    emit(documentResponse('S9', 'T9', 'L2', 'https://shop.pl/', 403));

    expect(await track(pace.gate(navigate('https://shop.pl/'))).settled()).toEqual({ type: 'go' });
});

test("a click and Enter wait for the page's site; moves, typing and a double click's second press do not", async () => {
    const { pace, clock, emit } = setup();
    emit(pageUrl('T1', 'https://shop.pl/'));
    emit(documentResponse('S1', 'T1', 'L1', 'https://shop.pl/', 200));

    for (const command of [
        input('Input.dispatchMouseEvent', { type: 'mouseMoved' }),
        input('Input.dispatchMouseEvent', { type: 'mousePressed', clickCount: 2 }),
        input('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a' }),
        input('Input.insertText', { text: 'buty' }),
    ]) {
        expect(await track(pace.gate(command)).settled()).toEqual({ type: 'go' });
    }
    const click = track(pace.gate(input('Input.dispatchMouseEvent', { type: 'mousePressed', clickCount: 1 })));
    const enter = track(pace.gate(input('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter' })));
    clock.advance(5 * SECOND);
    expect(await click.settled()).toEqual({ type: 'go' });
    expect(await enter.settled()).toBeUndefined();
    clock.advance(5 * SECOND);
    expect(await enter.settled()).toEqual({ type: 'go' });
});

/** A pace over a fake browser with one agent page `T1` (sessions `S1`, `S2`) and a clock moved by `advance()`. */
function setup() {
    const { container, logs } = createTestContainer();
    const clock = createFakeClock();
    const event = createEventEmitter<[event: CdpEvent]>();
    const ownership = createTargetOwnership();
    ownership.claimTarget('conv-a', 'T1');
    ownership.claimSession({ type: 'client', clientId: 'c1' }, 'S1', 'T1');
    ownership.claimSession({ type: 'client', clientId: 'c2' }, 'S2', 'T1');
    const browser: BrowserServiceShape = {
        start: unused,
        isRunning: () => true,
        send: unused,
        event: event.event,
        exited: createEventEmitter().event,
        ownership,
        bringToFront: unused,
        putBack: unused,
        thumbnail: unused,
        ensureDownloadsFolder: unused,
    };
    container.set(BrowserService, browser);
    container.set(Clock, clock);
    const pace = container.resolve(BrowserPace);
    return { pace, clock, logs, ownership, emit: (cdpEvent: CdpEvent) => event.emit(cdpEvent) };
}

function unused(): never {
    throw new Error('not used');
}

/** A promise whose verdict can be read without waiting: `settled()` gives it, or `undefined` while it is pending. */
function track(promise: Promise<PaceVerdict>) {
    let verdict: PaceVerdict | undefined;
    void promise.then(value => {
        verdict = value;
        return value;
    });
    return {
        async settled() {
            // Lets the promise chain run.
            for (let i = 0; i < 10; i++) {
                await Promise.resolve();
            }
            return verdict;
        },
    };
}

function navigate(url: string): PacedCommand {
    return { method: 'Page.navigate', params: { url }, sessionId: 'S1' };
}

function input(method: string, params: Record<string, unknown>): PacedCommand {
    return { method, params, sessionId: 'S1' };
}

function pageUrl(targetId: string, url: string): CdpEvent {
    return { method: 'Target.targetInfoChanged', params: { targetInfo: { targetId, type: 'page', url } } };
}

function documentResponse(
    sessionId: string,
    targetId: string,
    requestId: string,
    url: string,
    status: number,
    frameId = targetId,
): CdpEvent {
    return {
        method: 'Network.responseReceived',
        sessionId,
        params: { requestId, loaderId: requestId, frameId, type: 'Document', response: { url, status } },
    };
}

function request(sessionId: string, url: string): CdpEvent {
    return { method: 'Network.requestWillBeSent', sessionId, params: { requestId: url, request: { url } } };
}

/** A clock whose time moves only by `advance()`, which runs the timers due by then (as in `FileHoldService.test.ts`). */
function createFakeClock() {
    let now = 1_700_000_000_000;
    const timers: FakeTimer[] = [];
    const clock: Clock & { advance(ms: number): void } = {
        now: () => now,
        setTimeout(callback, ms) {
            const timer: FakeTimer = { at: now + ms, callback };
            timers.push(timer);
            return () => {
                const index = timers.indexOf(timer);
                if (index !== -1) {
                    timers.splice(index, 1);
                }
            };
        },
        advance(ms) {
            const until = now + ms;
            while (true) {
                const due = timers.filter(timer => timer.at <= until).toSorted((a, b) => a.at - b.at)[0];
                if (!due) {
                    break;
                }
                timers.splice(timers.indexOf(due), 1);
                now = due.at;
                due.callback();
            }
            now = until;
        },
    };
    return clock;
}

interface FakeTimer {
    at: number;
    callback: () => void;
}
