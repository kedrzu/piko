import { composeStories } from '@storybook/vue3-vite';
import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import type { GenerativeUiAnswer } from '@piko/common/generativeUi/GenerativeUiAnswer.js';

import * as stories from './GenerativeUi.stories.jsx';

const {
    Broken,
    Choices,
    ChoicesAnswered,
    ChoicesInactive,
    FormActive,
    FormAnswered,
    FormInactive,
    LegacyChoicesAnswered,
    LegacyForm,
    Streaming,
} = composeStories(stories);

test("a button click answers with its label and the row's name", async () => {
    const onAnswer = vi.fn(async (_answer: GenerativeUiAnswer) => {});
    await Choices.run({ args: { ...Choices.args, onAnswer } });

    await userEvent.click(page.getByRole('button', { name: 'Jedzenie' }));

    const expected: GenerativeUiAnswer = {
        kind: 'generativeUiAnswer',
        source: 'choices',
        name: 'choices',
        button: 'Jedzenie',
        defaultButton: true,
        fields: [],
    };
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(expected);
});

test('once answered, the button the person clicked is announced as chosen, the others not', async () => {
    await Choices.run();

    await userEvent.click(page.getByRole('button', { name: 'Ruch' }));

    await expect.element(page.getByRole('button', { name: 'Ruch' })).toHaveAttribute('aria-pressed', 'true');
    await expect.element(page.getByRole('button', { name: 'Ruch' })).toBeDisabled();
    await expect.element(page.getByRole('button', { name: 'Sen' })).not.toHaveAttribute('aria-pressed');
});

test('a structured answer marks the choice it names, nothing else', async () => {
    await ChoicesAnswered.run();
    await expect.element(page.getByRole('button', { name: 'Jedzenie' })).toHaveAttribute('aria-pressed', 'true');
    await expect.element(page.getByRole('button', { name: 'Sen' })).not.toHaveAttribute('aria-pressed');
});

test('a typed answer with stray spaces still marks the choice whose label it is; another answer marks none', async () => {
    await ChoicesAnswered.run({ args: { ...ChoicesAnswered.args, answer: '  Jedzenie\n' } });
    await expect.element(page.getByRole('button', { name: 'Jedzenie' })).toHaveAttribute('aria-pressed', 'true');

    await ChoicesAnswered.run({ args: { ...ChoicesAnswered.args, answer: 'Jedzenie, ale później' } });
    await expect.element(page.getByRole('button', { name: 'Jedzenie' })).not.toHaveAttribute('aria-pressed');
});

test("an old program's choices show, and its plain-text answer marks the button whose message or label it is", async () => {
    await LegacyChoicesAnswered.run({ args: { ...LegacyChoicesAnswered.args, answer: '  Zacznijmy od jedzenia\n' } });
    await expect.element(page.getByRole('button', { name: 'Jedzenie' })).toHaveAttribute('aria-pressed', 'true');
    await expect.element(page.getByRole('button', { name: 'Sen' })).not.toHaveAttribute('aria-pressed');

    await LegacyChoicesAnswered.run({ args: { ...LegacyChoicesAnswered.args, answer: 'Ruch' } });
    await expect.element(page.getByRole('button', { name: 'Ruch' })).toHaveAttribute('aria-pressed', 'true');
    await expect.element(page.getByRole('button', { name: 'Jedzenie' })).not.toHaveAttribute('aria-pressed');
});

test('an active UI marks no choice, whatever the answer', async () => {
    await ChoicesAnswered.run({ args: { ...ChoicesAnswered.args, active: true } });
    await expect.element(page.getByRole('button', { name: 'Jedzenie' })).not.toHaveAttribute('aria-pressed');
});

test('an optional field says so in its label; a required one carries no mark', async () => {
    await FormActive.run();

    await expect.element(page.getByRole('textbox', { name: 'Twój główny cel (optional)', exact: true })).toBeVisible();
    await expect.element(page.getByRole('textbox', { name: 'Jak masz na imię?', exact: true })).toBeVisible();
    await expect.element(page.getByRole('group', { name: 'Czym mam się zająć?', exact: true })).toBeVisible();
});

test('Enter in a field sends the form with the first button: its label and the filled fields in form order', async () => {
    const onAnswer = vi.fn(async (_answer: GenerativeUiAnswer) => {});
    await FormActive.run({ args: { ...FormActive.args, onAnswer } });

    await userEvent.click(page.getByRole('checkbox', { name: 'Ruch' }));
    await userEvent.click(page.getByRole('checkbox', { name: 'Sen' }));
    await userEvent.selectOptions(page.getByRole('combobox', { name: 'Od którego dnia zaczynamy?' }), 'Środa');
    await userEvent.fill(page.getByRole('textbox', { name: 'Coś jeszcze?' }), 'Wstaję o 6\nPracuję zdalnie');
    await userEvent.fill(page.getByRole('textbox', { name: 'Jak masz na imię?' }), 'Ola');
    await userEvent.keyboard('{Enter}');

    // The empty optional "Twój główny cel" is left out; the free text keeps its line break.
    const expected: GenerativeUiAnswer = {
        kind: 'generativeUiAnswer',
        source: 'form',
        name: 'plan',
        button: 'Ułóż plan',
        defaultButton: true,
        fields: [
            { name: 'name', label: 'Jak masz na imię?', value: 'Ola' },
            { name: 'day', label: 'Od którego dnia zaczynamy?', value: 'Środa' },
            { name: 'areas', label: 'Czym mam się zająć?', value: ['Sen', 'Ruch'] },
            { name: 'note', label: 'Coś jeszcze?', value: 'Wstaję o 6\nPracuję zdalnie' },
        ],
    };
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(expected);
});

test('another button of the form answers with its own label, not as the default send', async () => {
    const onAnswer = vi.fn(async (_answer: GenerativeUiAnswer) => {});
    await FormActive.run({ args: { ...FormActive.args, onAnswer } });

    await userEvent.fill(page.getByRole('textbox', { name: 'Jak masz na imię?' }), 'Ola');
    await userEvent.click(page.getByRole('checkbox', { name: 'Sen' }));
    await userEvent.click(page.getByRole('button', { name: 'Bez szczegółów' }));

    const expected: GenerativeUiAnswer = {
        kind: 'generativeUiAnswer',
        source: 'form',
        name: 'plan',
        button: 'Bez szczegółów',
        defaultButton: false,
        fields: [
            { name: 'name', label: 'Jak masz na imię?', value: 'Ola' },
            { name: 'areas', label: 'Czym mam się zająć?', value: ['Sen'] },
        ],
    };
    expect(onAnswer).toHaveBeenCalledWith(expected);
});

test("once sent, the form collapses away and the person's message shows its answers; the agent's text stays", async () => {
    await FormActive.run();

    await userEvent.fill(page.getByRole('textbox', { name: 'Jak masz na imię?' }), 'Ola');
    await userEvent.click(page.getByRole('checkbox', { name: 'Sen' }));
    await userEvent.click(page.getByRole('button', { name: 'Ułóż plan' }));

    await expect.element(page.getByRole('textbox', { name: 'Jak masz na imię?' })).not.toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: 'Ułóż plan' })).not.toBeInTheDocument();
    await expect.element(page.getByText('Żeby ułożyć plan, potrzebuję kilku informacji.')).toBeVisible();
    await expect.element(page.getByRole('definition').filter({ hasText: 'Ola' })).toBeVisible();
});

test('a conversation loaded with the form answered never shows the form', async () => {
    await FormAnswered.run();

    expect(document.querySelector('form')).toBeNull();
    await expect.element(page.getByText('Żeby ułożyć plan, potrzebuję kilku informacji.')).toBeVisible();
});

test("an old program's form shows its fields and buttons and answers with the clicked button's label", async () => {
    const onAnswer = vi.fn(async (_answer: GenerativeUiAnswer) => {});
    await LegacyForm.run({ args: { ...LegacyForm.args, onAnswer } });

    await userEvent.fill(page.getByRole('textbox', { name: 'Jak masz na imię?' }), 'Ola');
    await userEvent.click(page.getByRole('checkbox', { name: 'Sen' }));
    await userEvent.click(page.getByRole('button', { name: 'Bez szczegółów' }));

    expect(onAnswer).toHaveBeenCalledWith(
        expect.objectContaining<Partial<GenerativeUiAnswer>>({ button: 'Bez szczegółów', defaultButton: false }),
    );
});

test('with a required field empty the form sends nothing and the field says to fill it in', async () => {
    const onAnswer = vi.fn(async (_answer: GenerativeUiAnswer) => {});
    await FormActive.run({ args: { ...FormActive.args, onAnswer } });

    await userEvent.click(page.getByRole('checkbox', { name: 'Jedzenie' }));
    await userEvent.click(page.getByRole('button', { name: 'Ułóż plan' }));

    expect(onAnswer).not.toHaveBeenCalled();
    const name = page.getByRole('textbox', { name: 'Jak masz na imię?' });
    await expect.element(name).toHaveAttribute('aria-invalid', 'true');
    await expect.element(name).toHaveAccessibleDescription('Fill this in');
    await expect.element(page.getByRole('alert')).toHaveTextContent('Fill this in');
});

test('an inactive UI has its controls disabled', async () => {
    await ChoicesInactive.run();
    for (const name of ['Sen', 'Jedzenie', 'Ruch']) {
        await expect.element(page.getByRole('button', { name })).toBeDisabled();
    }
});

test('a passed-over form stays visible with every field and button disabled, and sends nothing on Enter', async () => {
    const onAnswer = vi.fn(async (_answer: GenerativeUiAnswer) => {});
    await FormInactive.run({ args: { ...FormInactive.args, onAnswer } });

    await expect.element(page.getByRole('textbox', { name: 'Jak masz na imię?' })).toBeDisabled();
    await expect.element(page.getByRole('textbox', { name: 'Coś jeszcze?' })).toBeDisabled();
    await expect.element(page.getByRole('combobox', { name: 'Od którego dnia zaczynamy?' })).toBeDisabled();
    await expect.element(page.getByRole('checkbox', { name: 'Sen' })).toBeDisabled();
    await expect.element(page.getByRole('button', { name: 'Ułóż plan' })).toBeDisabled();
    await expect.element(page.getByRole('button', { name: 'Bez szczegółów' })).toBeDisabled();

    page.getByRole('button', { name: 'Ułóż plan' }).element().closest('form')?.requestSubmit();
    await new Promise(resolve => {
        setTimeout(resolve, 100);
    });
    expect(onAnswer).not.toHaveBeenCalled();
});

test('a program still streaming shows what is written so far, disabled, and never its code', async () => {
    await Streaming.run();

    await expect.element(page.getByText('Żeby ułożyć plan, potrzebuję kilku informacji.')).toBeVisible();
    await expect.element(page.getByRole('textbox', { name: 'Jak masz na imię?' })).toBeDisabled();
    expect(document.body.textContent).not.toContain('root =');
});

test('a broken program shows its valid part and never its code', async () => {
    await Broken.run();

    await expect.element(page.getByText('Ten program ma błędy, a pokazuje to, co w nim poprawne.')).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Rozumiem' })).toBeVisible();
    // Opening a page is not an answer the UI sends: that button is left out.
    await expect.element(page.getByRole('button', { name: 'Otwórz stronę' })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/root =|Carousel|@ToAssistant/);
});
