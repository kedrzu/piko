import { defineInterface } from '@nzyme/ioc/Interface.js';

/** The time and timers, behind an interface so a test can move time itself instead of waiting. */
export interface Clock {
    /** Milliseconds since the epoch, like `Date.now()`. */
    now(): number;
    /** Calls `callback` once after `ms`; the returned function cancels it. */
    setTimeout(callback: () => void, ms: number): () => void;
}

/** The system's clock unless a container sets another. */
export const Clock = defineInterface<Clock>({
    name: 'Clock',
    default: () => ({
        now: () => Date.now(),
        setTimeout(callback, ms) {
            const timer = setTimeout(callback, ms);
            return () => clearTimeout(timer);
        },
    }),
});
