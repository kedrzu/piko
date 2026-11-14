import { composeStories } from '@storybook/vue3-vite';
import { expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import * as stories from './Toaster.stories.jsx';

const { OpensLater, Stack } = composeStories(stories);

test('the toasts sit in a region named "Notifications"', async () => {
    await Stack.run();

    const region = page.getByRole('region', { name: 'Notifications' });
    await expect.element(region.getByRole('listitem').filter({ hasText: 'Projekt „Faktury” utworzony' })).toBeVisible();
});

test('a toast that opens later goes below the others, wherever it is in the markup', async () => {
    await OpensLater.run();
    const first = page.getByRole('listitem').filter({ hasText: 'Otwarte od początku' });
    await expect.element(first).toBeVisible();

    await userEvent.click(page.getByRole('button', { name: 'Pokaż drugie' }));

    const later = page.getByRole('listitem').filter({ hasText: 'Otwarte później' });
    await expect.element(later).toBeVisible();
    expect(later.element().getBoundingClientRect().top).toBeGreaterThan(first.element().getBoundingClientRect().top);
});
