import { composeStories } from '@storybook/vue3-vite';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';

import * as stories from './UserMessage.stories.jsx';

const { FormAnswer, FormAnswerNothingFilled, FormAnswerOtherButton } = composeStories(stories);

test("a form's answers pair each label with its values, without the default button's label", async () => {
    await FormAnswer.run();

    const terms = page.getByRole('term');
    expect(terms.elements().map(term => term.textContent.trim())).toEqual([
        'Wybierz, co pasuje',
        'Ile czasu tygodniowo?',
        'Coś jeszcze?',
    ]);
    // Each pick is its own value of the same term.
    expect(page.getByRole('definition').elements()).toHaveLength(5);
    await expect.element(page.getByText('Wyślij')).not.toBeInTheDocument();
});

test('a button other than the first follows the answers; with nothing filled its label stands alone', async () => {
    await FormAnswerOtherButton.run();
    await expect.element(page.getByText('Zapisz na później')).toBeVisible();
    await expect.element(page.getByRole('term')).toHaveTextContent('Ile czasu tygodniowo?');

    await FormAnswerNothingFilled.run();
    await expect.element(page.getByText('Pomiń na razie')).toBeVisible();
    await expect.element(page.getByRole('term')).not.toBeInTheDocument();
});
