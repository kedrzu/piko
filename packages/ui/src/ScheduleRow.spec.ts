import { composeStories } from '@storybook/vue3-vite';
import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import * as stories from './ScheduleRow.stories.jsx';

const { Finished } = composeStories(stories);

test('the switch pauses the schedule, above the row-wide link', async () => {
    const update = vi.fn();
    await Finished.run({ args: { ...Finished.args, 'onUpdate:paused': update } });

    await userEvent.click(page.getByRole('switch', { name: 'Sortuj moją pocztę' }));

    expect(update).toHaveBeenCalledWith(true);
});
