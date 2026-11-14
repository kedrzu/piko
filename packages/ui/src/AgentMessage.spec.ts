import { composeStories } from '@storybook/vue3-vite';
import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import * as stories from './AgentMessage.stories.jsx';

const { AnsweredChoice, FinishedWithActiveUi, FinishedWithInactiveUi, RunningHalfWrittenUi, TwoUis } =
    composeStories(stories);

test('only the last UI of the reply takes answers, and only when the reply is active', async () => {
    await TwoUis.run();
    await expect.element(page.getByRole('button', { name: 'Sen' })).toBeDisabled();
    await expect.element(page.getByRole('checkbox', { name: 'Sen' })).toBeEnabled();
    await expect.element(page.getByRole('button', { name: 'Ułóż plan' })).toBeEnabled();

    await FinishedWithInactiveUi.run();
    await expect.element(page.getByRole('button', { name: 'Ułóż plan' })).toBeDisabled();
});

test('a click in the active UI reports the reply to the listener', async () => {
    const reply = vi.fn(async (_text: string) => {});
    await FinishedWithActiveUi.run({ args: { ...FinishedWithActiveUi.args, onReply: reply } });

    await userEvent.click(page.getByRole('checkbox', { name: 'Ruch' }));
    await userEvent.click(page.getByRole('button', { name: 'Ułóż plan' }));

    expect(reply).toHaveBeenCalledWith('Ułóż mi plan\n\nCzym mam się zająć?: Ruch');
});

test('a block still being written shows its controls disabled and never its code', async () => {
    await RunningHalfWrittenUi.run();

    await expect.element(page.getByText('Żeby ułożyć plan, potrzebuję kilku informacji.').first()).toBeVisible();
    await expect.element(page.getByText('openui')).not.toBeInTheDocument();
    await expect.element(page.getByText('root = Stack')).not.toBeInTheDocument();
});

test("the person's next message marks the choice it sent, only in the reply's last UI", async () => {
    await AnsweredChoice.run();
    await expect.element(page.getByRole('button', { name: 'Sen' })).toHaveAttribute('aria-pressed', 'true');

    await TwoUis.run({ args: { ...TwoUis.args, uiActive: false, answer: 'Zacznijmy od snu' } });
    await expect.element(page.getByRole('button', { name: 'Sen' })).not.toHaveAttribute('aria-pressed');
});
