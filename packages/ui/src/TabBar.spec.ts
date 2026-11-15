import { composeStories } from '@storybook/vue3-vite';
import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import * as stories from './TabBar.stories.jsx';

const { Default } = composeStories(stories);

test("only the active tab has a ×, and it reports that tab's id", async () => {
    const close = vi.fn();
    await Default.run({ args: { ...Default.args, onClose: close } });

    const tabs = page.getByRole('navigation', { name: 'Open tabs' });
    await expect
        .element(tabs.getByRole('link', { name: 'Poranna rutyna na zimę' }))
        .toHaveAttribute('aria-current', 'page');
    await expect.element(tabs.getByRole('link', { name: 'Pamięć' })).not.toHaveAttribute('aria-current');
    expect(tabs.getByRole('button').all()).toHaveLength(1);

    await userEvent.click(tabs.getByRole('button', { name: 'Close Poranna rutyna na zimę' }));
    expect(close).toHaveBeenCalledWith('c1');
});
