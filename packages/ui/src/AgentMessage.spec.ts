import { composeStories } from '@storybook/vue3-vite';
import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import type { GenerativeUiAnswer } from '@piko/common/generativeUi/GenerativeUiAnswer.js';

import * as stories from './AgentMessage.stories.jsx';

const {
    AnsweredChoice,
    AnsweredForm,
    FormAnsweredByTyping,
    LegacyAnsweredChoice,
    FinishedWithActiveUi,
    FinishedWithInactiveUi,
    RunningHalfWrittenUi,
    RunningWithFile,
    SeveralFiles,
    TwoUis,
} = composeStories(stories);

test('only the last UI of the reply takes answers, and only when the reply is active', async () => {
    await TwoUis.run();
    await expect.element(page.getByRole('button', { name: 'Sen' })).toBeDisabled();
    await expect.element(page.getByRole('checkbox', { name: 'Sen' })).toBeEnabled();
    await expect.element(page.getByRole('button', { name: 'Ułóż plan' })).toBeEnabled();

    await FinishedWithInactiveUi.run();
    await expect.element(page.getByRole('button', { name: 'Ułóż plan' })).toBeDisabled();
});

test('a click in the active UI reports the answer to the listener', async () => {
    const onAnswer = vi.fn(async (_answer: GenerativeUiAnswer) => {});
    await FinishedWithActiveUi.run({ args: { ...FinishedWithActiveUi.args, onAnswer } });

    await userEvent.click(page.getByRole('checkbox', { name: 'Ruch' }));
    await userEvent.click(page.getByRole('button', { name: 'Ułóż plan' }));

    const expected: GenerativeUiAnswer = {
        kind: 'generativeUiAnswer',
        source: 'form',
        name: 'plan',
        button: 'Ułóż plan',
        defaultButton: true,
        fields: [{ name: 'areas', label: 'Czym mam się zająć?', value: ['Ruch'] }],
    };
    expect(onAnswer).toHaveBeenCalledWith(expected);
});

test('a block still being written shows its controls disabled and never its code', async () => {
    await RunningHalfWrittenUi.run();

    await expect.element(page.getByText('Żeby ułożyć plan, potrzebuję kilku informacji.').first()).toBeVisible();
    await expect.element(page.getByText('openui')).not.toBeInTheDocument();
    await expect.element(page.getByText('root = Stack')).not.toBeInTheDocument();
});

test("the person's answer marks the choice it picked, only in the reply's last UI", async () => {
    await AnsweredChoice.run();
    await expect.element(page.getByRole('button', { name: 'Sen' })).toHaveAttribute('aria-pressed', 'true');
    await expect.element(page.getByRole('button', { name: 'Jedzenie' })).not.toHaveAttribute('aria-pressed');

    await TwoUis.run({ args: { ...TwoUis.args, uiActive: false, answer: AnsweredChoice.args.answer } });
    await expect.element(page.getByRole('button', { name: 'Sen' })).not.toHaveAttribute('aria-pressed');
});

test("an old program's choice answered with its message keeps its check", async () => {
    await LegacyAnsweredChoice.run();

    await expect.element(page.getByRole('button', { name: 'Sen' })).toHaveAttribute('aria-pressed', 'true');
    await expect.element(page.getByRole('button', { name: 'Jedzenie' })).not.toHaveAttribute('aria-pressed');
});

test("a form answered through it is gone from the reply, the agent's text around it stays", async () => {
    await AnsweredForm.run();

    await expect.element(page.getByText('Daj znać, a ułożę go od razu.')).toBeVisible();
    await expect.element(page.getByText('Żeby ułożyć plan, potrzebuję kilku informacji.').first()).toBeVisible();
    await expect.element(page.getByRole('checkbox', { name: 'Sen' })).not.toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: 'Ułóż plan' })).not.toBeInTheDocument();
});

test('a form the person answered by typing stays, inactive', async () => {
    await FormAnsweredByTyping.run();

    await expect.element(page.getByRole('checkbox', { name: 'Sen' })).toBeDisabled();
    await expect.element(page.getByRole('button', { name: 'Ułóż plan' })).toBeDisabled();
});

test('a chip for each file the reply wrote or changed, once each in step order, none for a failed step', async () => {
    await SeveralFiles.run();

    const chips = page.getByRole('link');
    await expect.element(chips.nth(0)).toHaveAccessibleName('Open beside the conversation: notes/Plan.md Zdrowie');
    await expect.element(chips.nth(1)).toHaveAccessibleName('Open beside the conversation: budget.csv Zdrowie');
    expect(chips.elements()).toHaveLength(2);
});

test('a file whose step still runs reads "writing…"', async () => {
    await RunningWithFile.run();

    await expect.element(page.getByRole('link', { name: 'plan.md' })).toHaveTextContent('writing…');
});
