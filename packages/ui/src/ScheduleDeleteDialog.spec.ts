import { composeStories } from '@storybook/vue3-vite';
import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import * as stories from './ScheduleDeleteDialog.stories.jsx';

const { Open } = composeStories(stories);

test('the dialog says what deleting does, keeps focus inside and confirms once', async () => {
    const confirm = vi.fn(async () => {});
    await Open.run({ args: { ...Open.args, onConfirm: confirm } });

    const dialog = page.getByRole('dialog', { name: 'Delete Sortuj moją pocztę?' });
    await expect.element(dialog).toHaveAccessibleDescription(/run\shistory\sis\sdeleted.*stay\sin\sPoczta/);
    const cancel = dialog.getByRole('button', { name: 'Cancel' });
    const remove = dialog.getByRole('button', { name: 'Delete schedule' });
    await expect.element(cancel).toHaveFocus();
    await userEvent.tab();
    await expect.element(remove).toHaveFocus();
    await userEvent.tab();
    await expect.element(cancel).toHaveFocus();

    await userEvent.click(remove);
    expect(confirm).toHaveBeenCalledTimes(1);
});

test('Cancel closes the dialog without confirming', async () => {
    const confirm = vi.fn();
    const update = vi.fn();
    await Open.run({ args: { ...Open.args, onConfirm: confirm, 'onUpdate:open': update } });

    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));

    expect(update).toHaveBeenCalledWith(false);
    expect(confirm).not.toHaveBeenCalled();
});
