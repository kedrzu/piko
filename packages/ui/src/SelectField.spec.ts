import { composeStories } from '@storybook/vue3-vite';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';

import * as stories from './SelectField.stories.jsx';

const { Chosen, Invalid } = composeStories(stories);

test('the dropdown is named by its whole visible label, optional mark included, and described by its help', async () => {
    await Chosen.run();

    const select = page.getByRole('combobox', { name: 'Od którego dnia zaczynamy? (optional)' });
    await expect.element(select).toHaveAccessibleDescription('Plan zacznie się tego dnia rano.');
    await expect.element(select).not.toHaveAttribute('aria-invalid');
});

test('an error marks the dropdown invalid and describes it', async () => {
    await Invalid.run();

    const select = page.getByRole('combobox', { name: 'Od którego dnia zaczynamy?' });
    await expect.element(select).toHaveAttribute('aria-invalid', 'true');
    await expect.element(select).toHaveAccessibleDescription('Uzupełnij to pole');
});
