import { composeStories } from '@storybook/vue3-vite';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';

import * as stories from './ConversationLayout.stories.jsx';

const { Scrolling } = composeStories(stories);

test('a conversation longer than the window scrolls inside the layout, never the window', async () => {
    await page.viewport(1024, 700);
    await Scrolling.run();

    // Every message carries a visually hidden author label: absolutely positioned, so it would
    // stretch the document if the scroller did not contain it.
    expect(document.documentElement.scrollHeight).toBe(window.innerHeight);
});
