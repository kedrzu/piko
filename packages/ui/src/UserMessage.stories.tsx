import type { Meta, StoryObj } from '@storybook/vue3-vite';

import type { GenerativeUiAnswer } from '@piko/common/generativeUi/GenerativeUiAnswer.js';

import UserMessage from './UserMessage.vue';

const meta: Meta<typeof UserMessage> = { title: 'UserMessage', component: UserMessage, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof UserMessage>;

/** Screens 78 and 81: picks, a dropdown and free text, sent with the form's first button. */
const FORM_ANSWER: GenerativeUiAnswer = {
    kind: 'generativeUiAnswer',
    source: 'form',
    name: 'help',
    button: 'Wyślij',
    defaultButton: true,
    fields: [
        {
            name: 'areas',
            label: 'Wybierz, co pasuje',
            value: [
                'Teksty i komunikacja (maile, posty, LinkedIn)',
                'Szukanie informacji i porównywanie',
                'Planowanie i organizacja',
            ],
        },
        { name: 'time', label: 'Ile czasu tygodniowo?', value: '1–2 godziny' },
        {
            name: 'note',
            label: 'Coś jeszcze?',
            value:
                'W rzeczach zawodowych raczej nie potrzebuję pomocy, radzę sobie w osobnym agencie kodującym. ' +
                'Bardziej potrzebuję tego do pobocznych projektów i spraw osobistych.\nNa przykład: prowadzę ' +
                'małego bloga o górach i chciałbym, żeby ktoś pilnował terminów wpisów i podsuwał tematy.',
        },
    ],
};

export const Default: Story = {
    render: () => (
        <UserMessage text="Ułóż mi poranną rutynę pielęgnacyjną na zimę. Moje notatki o skórze są w pliku notatki.md." />
    ),
};

/** Line breaks the person typed stay; markup stays text. */
export const Multiline: Story = {
    render: () => <UserMessage text={'Dwie rzeczy:\n1. rano krótko\n2. wieczorem <b>dłużej</b>'} />,
};

/** Screen 81: a form's answers, each under its label — picks one per line with a check, a dropdown's value, free text. */
export const FormAnswer: Story = {
    render: () => (
        <UserMessage
            text=""
            answer={FORM_ANSWER}
        />
    ),
};

/** Sent with a button other than the form's first: its label follows the answers. */
export const FormAnswerOtherButton: Story = {
    render: () => (
        <UserMessage
            text=""
            answer={{
                ...FORM_ANSWER,
                button: 'Zapisz na później',
                defaultButton: false,
                fields: FORM_ANSWER.fields.slice(1, 2),
            }}
        />
    ),
};

/** Screen 82: nothing filled: the clicked button's label alone, an ordinary message. */
export const FormAnswerNothingFilled: Story = {
    render: () => (
        <UserMessage
            text=""
            answer={{ ...FORM_ANSWER, button: 'Pomiń na razie', defaultButton: false, fields: [] }}
        />
    ),
};

/** A picked choice: its label, as on the button. */
export const ChoiceAnswer: Story = {
    render: () => (
        <UserMessage
            text=""
            answer={{
                kind: 'generativeUiAnswer',
                source: 'choices',
                button: 'Zacznijmy od tekstów',
                defaultButton: true,
                fields: [],
            }}
        />
    ),
};
