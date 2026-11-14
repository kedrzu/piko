import { defineContext } from '@nzyme/vue-utils/context.js';
import { reactive } from 'vue';

/** What the main shell (`MainShell.vue`) offers the screen open in it. */
export interface MainShellState {
    /** Whether the new-project dialog shows. */
    newProjectOpen: boolean;
    /**
     * Where the home screen landed the person at the app's start (the full path); `null` until it has. While they are
     * still there, App setup's onboarding, once started, opens in its place.
     */
    landing: string | null;
}

/** What the main shell (`MainShell.vue`) offers the screen open in it. */
export const MainShellContext = defineContext('MainShellContext', () =>
    reactive<MainShellState>({ newProjectOpen: false, landing: null }),
);
