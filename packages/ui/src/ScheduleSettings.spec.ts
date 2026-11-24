import { composeStories } from '@storybook/vue3-vite';
import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import * as stories from './ScheduleSettings.stories.jsx';
import type { ScheduleSettingsValue } from './ScheduleSettings.vue';

const { Interactive, EditingWeekly, SaveFailed } = composeStories(stories);

test('Edit moves focus into the form and Cancel back to the Edit pressed', async () => {
    await Interactive.run();

    const editPrompt = page.getByRole('button', { name: 'Edit what it does' });
    await userEvent.click(editPrompt);
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveFocus();

    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));
    await expect.element(editPrompt).toHaveFocus();
});

test('Save reports the edits with the time as HH:MM and returns focus to Edit', async () => {
    const save = vi.fn();
    await Interactive.run({ args: { onSave: save } });

    const editWhen = page.getByRole('button', { name: 'Edit when it runs' });
    await userEvent.click(editWhen);
    await userEvent.fill(page.getByRole('textbox', { name: 'Name' }), 'Poranna poczta');
    await userEvent.selectOptions(page.getByRole('combobox', { name: 'Repeat' }), 'Every month on day');
    await userEvent.selectOptions(page.getByRole('combobox', { name: 'Day of the month' }), '3');
    await userEvent.fill(page.getByRole('textbox', { name: 'Time' }), '7:30');
    await userEvent.keyboard('{Enter}');

    const expected: ScheduleSettingsValue = {
        name: 'Poranna poczta',
        prompt: expect.stringContaining('Przejrzyj nową pocztę'),
        preset: { repeat: 'monthly', monthDay: 3, time: '07:30' },
    };
    expect(save).toHaveBeenCalledWith(expected);
    await expect.element(editWhen).toHaveFocus();
});

test('a time that is not one is refused on the field, and nothing is saved', async () => {
    const save = vi.fn();
    await EditingWeekly.run({ args: { ...EditingWeekly.args, onSave: save } });

    const time = page.getByRole('textbox', { name: 'Time' });
    await userEvent.fill(time, '25:00');
    await userEvent.click(page.getByRole('button', { name: 'Save' }));

    await expect.element(time).toHaveAttribute('aria-invalid', 'true');
    expect(save).not.toHaveBeenCalled();
});

test('a failed save is announced and describes the form and Save', async () => {
    await SaveFailed.run();

    const alert = page.getByRole('alert');
    await expect.element(alert).toHaveTextContent(/^Couldn't save\. Ta godzina nie istnieje/);
    await expect.element(page.getByRole('form', { name: 'How it runs' })).toHaveAccessibleDescription(/Couldn't save/);
    await expect.element(page.getByRole('button', { name: 'Save' })).toHaveAccessibleDescription(/Couldn't save/);
});
