import { composeStories } from '@storybook/vue3-vite';
import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import * as stories from './UpdateToast.stories.jsx';

const { Installing, InstallFailed, Ready } = composeStories(stories);

test('Restart emits restart, and only it', async () => {
    const onRestart = vi.fn();
    const onDismiss = vi.fn();
    await Ready.run({ args: { ...Ready.args, onRestart, onDismiss } });

    await userEvent.click(page.getByRole('button', { name: 'Restart' }));

    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
});

test('Try again after a failed install emits restart', async () => {
    const onRestart = vi.fn();
    await InstallFailed.run({ args: { ...InstallFailed.args, onRestart } });

    await userEvent.click(page.getByRole('button', { name: 'Try again' }));

    expect(onRestart).toHaveBeenCalledTimes(1);
});

test('the × emits dismiss and never restart', async () => {
    const onRestart = vi.fn();
    const onDismiss = vi.fn();
    await Ready.run({ args: { ...Ready.args, onRestart, onDismiss } });

    await userEvent.click(page.getByRole('button', { name: 'Close' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onRestart).not.toHaveBeenCalled();
});

test('while restarting the button is busy and the × is disabled', async () => {
    const onRestart = vi.fn();
    await Installing.run({ args: { ...Installing.args, onRestart } });

    const restart = page.getByRole('button', { name: 'Restarting…' });
    await expect.element(restart).toHaveAttribute('aria-busy', 'true');
    await expect.element(page.getByRole('button', { name: 'Close' })).toBeDisabled();

    await userEvent.click(restart, { force: true });
    expect(onRestart).not.toHaveBeenCalled();
});
