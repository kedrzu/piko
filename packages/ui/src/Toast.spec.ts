import { composeStories } from '@storybook/vue3-vite';
import { expect, onTestFinished, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { nextTick } from 'vue';

import * as stories from './Toast.stories.jsx';
import { TOAST_LASTS } from './Toast.vue';

const { Neutral, NotClosable, Timed } = composeStories(stories);

test('a timed toast never closes while hovered; it does once the pointer leaves', async () => {
    const toast = await showTimed();

    await userEvent.hover(toast);
    await advance(TOAST_LASTS.timed * 2);
    expect(toast.query()).not.toBeNull();

    await userEvent.unhover(toast);
    await advance(TOAST_LASTS.timed);
    expect(toast.query()).toBeNull();
});

test('a timed toast never closes while focused; its × is reached by keyboard and closes it', async () => {
    const toast = await showTimed();
    const close = toast.getByRole('button', { name: 'Close' });

    // F8 focuses the toasts' region; Tab goes through the toast to its ×.
    await userEvent.keyboard('{F8}');
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(close.element());

    await advance(TOAST_LASTS.timed * 2);
    expect(toast.query()).not.toBeNull();

    await userEvent.keyboard('{Enter}');
    await nextTick();
    expect(toast.query()).toBeNull();
});

test('Escape closes a toast only from inside it', async () => {
    await Neutral.run();
    const toast = page.getByRole('listitem');
    await expect.element(toast).toBeVisible();

    await userEvent.keyboard('{Escape}');
    await expect.element(toast).toBeVisible();

    toast.element().focus();
    await userEvent.keyboard('{Escape}');
    await expect.element(toast).not.toBeInTheDocument();
});

test('a toast that is not closable has its × disabled and stays on Escape inside it', async () => {
    await NotClosable.run();
    const toast = page.getByRole('listitem');
    await expect.element(toast.getByRole('button', { name: 'Close' })).toBeDisabled();

    toast.element().focus();
    await userEvent.keyboard('{Escape}');
    await expect.element(toast).toBeVisible();
});

/** Opens the `Timed` toast with timers faked from before it opens, so the test drives its countdown. */
async function showTimed() {
    await Timed.run({ args: { open: false } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    onTestFinished(() => {
        vi.useRealTimers();
    });

    await userEvent.click(page.getByRole('button', { name: 'Pokaż' }));
    await nextTick();
    const toast = page.getByRole('listitem').filter({ hasText: 'Zamknie się samo' });
    expect(toast.query()).not.toBeNull();
    return toast;
}

async function advance(ms: number) {
    await vi.advanceTimersByTimeAsync(ms);
    await nextTick();
}
