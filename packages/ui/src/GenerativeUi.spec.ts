import { composeStories } from '@storybook/vue3-vite';
import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import * as stories from './GenerativeUi.stories.jsx';

const { Broken, Choices, ChoicesAnswered, ChoicesInactive, FormActive, FormInactive, Streaming } =
    composeStories(stories);

test('a button click replies with exactly its message', async () => {
    const reply = vi.fn(async (_text: string) => {});
    await Choices.run({ args: { ...Choices.args, onReply: reply } });

    await userEvent.click(page.getByRole('button', { name: 'Jedzenie' }));

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith('Zacznijmy od jedzenia');
});

test('once answered, the button whose message the person sent is announced as chosen, the others not', async () => {
    await Choices.run();

    await userEvent.click(page.getByRole('button', { name: 'Ruch' }));

    await expect.element(page.getByRole('button', { name: 'Ruch' })).toHaveAttribute('aria-pressed', 'true');
    await expect.element(page.getByRole('button', { name: 'Ruch' })).toBeDisabled();
    await expect.element(page.getByRole('button', { name: 'Sen' })).not.toHaveAttribute('aria-pressed');
});

test('an answer typed with stray spaces still marks its choice; another answer marks none', async () => {
    await ChoicesAnswered.run({ args: { ...ChoicesAnswered.args, answer: '  Zacznijmy od jedzenia\n' } });
    await expect.element(page.getByRole('button', { name: 'Jedzenie' })).toHaveAttribute('aria-pressed', 'true');

    await ChoicesAnswered.run({ args: { ...ChoicesAnswered.args, answer: 'Zacznijmy od jedzenia, ale później' } });
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

test('Enter in a field sends the form with the first button: its message, then the filled fields in order', async () => {
    const reply = vi.fn(async (_text: string) => {});
    await FormActive.run({ args: { ...FormActive.args, onReply: reply } });

    await userEvent.click(page.getByRole('checkbox', { name: 'Ruch' }));
    await userEvent.click(page.getByRole('checkbox', { name: 'Sen' }));
    await userEvent.selectOptions(page.getByRole('combobox', { name: 'Od którego dnia zaczynamy?' }), 'Środa');
    await userEvent.fill(page.getByRole('textbox', { name: 'Coś jeszcze?' }), 'Wstaję o 6\nPracuję zdalnie');
    await userEvent.fill(page.getByRole('textbox', { name: 'Jak masz na imię?' }), 'Ola');
    await userEvent.keyboard('{Enter}');

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith(
        'Ułóż mi plan\n\n' +
            'Jak masz na imię?: Ola\n' +
            'Od którego dnia zaczynamy?: Środa\n' +
            'Czym mam się zająć?: Sen, Ruch\n' +
            'Coś jeszcze?: Wstaję o 6\nPracuję zdalnie',
    );
});

test('another button of the form sends its own message', async () => {
    const reply = vi.fn(async (_text: string) => {});
    await FormActive.run({ args: { ...FormActive.args, onReply: reply } });

    await userEvent.fill(page.getByRole('textbox', { name: 'Jak masz na imię?' }), 'Ola');
    await userEvent.click(page.getByRole('checkbox', { name: 'Sen' }));
    await userEvent.click(page.getByRole('button', { name: 'Bez szczegółów' }));

    expect(reply).toHaveBeenCalledWith('Ułóż plan bez szczegółów\n\nJak masz na imię?: Ola\nCzym mam się zająć?: Sen');
});

test('with a required field empty the form sends nothing and the field says to fill it in', async () => {
    const reply = vi.fn(async (_text: string) => {});
    await FormActive.run({ args: { ...FormActive.args, onReply: reply } });

    await userEvent.click(page.getByRole('checkbox', { name: 'Jedzenie' }));
    await userEvent.click(page.getByRole('button', { name: 'Ułóż plan' }));

    expect(reply).not.toHaveBeenCalled();
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

test('an inactive form has every field and button disabled and sends nothing on Enter', async () => {
    const reply = vi.fn(async (_text: string) => {});
    await FormInactive.run({ args: { ...FormInactive.args, onReply: reply } });

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
    expect(reply).not.toHaveBeenCalled();
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
