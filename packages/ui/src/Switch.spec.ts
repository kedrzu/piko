import { composeStories } from '@storybook/vue3-vite';
import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import * as stories from './Switch.stories.jsx';

const { Off } = composeStories(stories);

test('a click reports the new state and leaves the switch as the parent holds it', async () => {
    const update = vi.fn();
    await Off.run({ args: { ...Off.args, 'onUpdate:modelValue': update } });

    const toggle = page.getByRole('switch', { name: 'Faktury za remont' });
    await userEvent.click(toggle);

    expect(update).toHaveBeenCalledWith(true);
    await expect.element(toggle).toHaveAttribute('aria-checked', 'false');
});
