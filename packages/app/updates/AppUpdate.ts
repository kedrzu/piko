import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { computed, reactive, shallowRef } from 'vue';

/** What the desktop shell's updater is doing, or how the last thing it did ended. */
export type UpdateActivity =
    | { readonly kind: 'idle' }
    | { readonly kind: 'checking' }
    | { readonly kind: 'upToDate' }
    | { readonly kind: 'downloading'; readonly version: string; readonly percent: number | null }
    | { readonly kind: 'ready'; readonly version: string }
    | { readonly kind: 'failed'; readonly reason: 'offline' | 'unreachable' }
    | { readonly kind: 'noRelease' }
    | { readonly kind: 'installing'; readonly version: string }
    | { readonly kind: 'installFailed'; readonly version: string };

/** Everything the shell knows about updates, sent whole on every change (the `update-state` event, `update_status`). */
export interface UpdateState {
    /** The running version. */
    readonly version: string;
    /** The commit it was built from; `null` for a local build. */
    readonly commit: string | null;
    /** When the last check finished, epoch ms. */
    readonly checkedAt: number | null;
    readonly activity: UpdateActivity;
}

/** An update waiting on the person's word: downloaded, being restarted into, or its install failed. */
export type UpdateOffer = Extract<UpdateActivity, { readonly kind: 'ready' | 'installing' | 'installFailed' }>;

/**
 * The app's updates as the desktop shell reports them: it checks, downloads and installs in the background, and the
 * person alone restarts into the result (`restart`). Outside the desktop app (dev, e2e) it does nothing: no state, no
 * offer. It listens first and then asks once, so no change is missed.
 */
export const AppUpdate = defineService({
    name: 'AppUpdate',
    deps: { logger: Logger },
    setup({ logger }) {
        const state = shallowRef<UpdateState | null>(null);
        /** The offer was put off with `later`: until the app next starts. */
        const putOff = shallowRef(false);

        if (isTauri()) {
            void watchUpdates();
        }

        return reactive({
            /** The shell's state; `null` outside the desktop app and before its first answer. */
            state: computed(() => state.value),
            /** What the update toast shows; `null` when nothing waits on the person, or after `later`. */
            offer: computed(() => (putOff.value ? null : getOffer(state.value))),
            restart,
            later,
        });

        /** Restarts into the ready version, or tries installing it again; the only path to a restart. */
        function restart() {
            if (!isTauri()) {
                return;
            }

            invoke('update_restart').catch((error: unknown) => {
                logger.warn('Could not restart into the update', { error });
            });
        }

        /** Hides the offer until the app next starts. */
        function later() {
            putOff.value = true;
        }

        async function watchUpdates() {
            try {
                await listen('update-state', event => {
                    if (isUpdateState(event.payload)) {
                        state.value = event.payload;
                    }
                });
                const current = await invoke('update_status');
                // An event that got here first is newer than this answer.
                if (state.value === null && isUpdateState(current)) {
                    state.value = current;
                }
            } catch (error) {
                logger.warn('Could not listen for app updates', { error });
            }
        }
    },
});

function getOffer(state: UpdateState | null): UpdateOffer | null {
    switch (state?.activity.kind) {
        case 'ready':
        case 'installing':
        case 'installFailed':
            return state.activity;
        default:
            return null;
    }
}

function isUpdateState(payload: unknown): payload is UpdateState {
    return (
        isRecord(payload) &&
        typeof payload.version === 'string' &&
        (payload.commit === null || typeof payload.commit === 'string') &&
        (payload.checkedAt === null || typeof payload.checkedAt === 'number') &&
        isUpdateActivity(payload.activity)
    );
}

function isUpdateActivity(activity: unknown): activity is UpdateActivity {
    if (!isRecord(activity)) {
        return false;
    }

    switch (activity.kind) {
        case 'idle':
        case 'checking':
        case 'upToDate':
        case 'noRelease':
            return true;
        case 'ready':
        case 'installing':
        case 'installFailed':
            return typeof activity.version === 'string';
        case 'downloading':
            return (
                typeof activity.version === 'string' &&
                (activity.percent === null || typeof activity.percent === 'number')
            );
        case 'failed':
            return activity.reason === 'offline' || activity.reason === 'unreachable';
        default:
            return false;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
