import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, ref } from 'vue';

import type { GenerativeUiAnswer } from '@piko/common/generativeUi/GenerativeUiAnswer.js';
import { buildGenerativeUiAnswerText, readGenerativeUiAnswer } from '@piko/common/generativeUi/GenerativeUiAnswer.js';

import AgentMark from './AgentMark.vue';
import GenerativeUi from './GenerativeUi.vue';
import styles from './GenerativeUi.stories.module.scss';
import UserMessage from './UserMessage.vue';

const meta: Meta<typeof GenerativeUi> = { title: 'GenerativeUi', component: GenerativeUi, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof GenerativeUi>;

const CHOICES = `root = Stack([intro, choices])
intro = Text("Od czego zaczynamy porządki w projekcie Zdrowie?")
choices = Buttons([sleep, food, moves])
sleep = Button("Sen")
food = Button("Jedzenie")
moves = Button("Ruch")
`;

const FORM = `root = Stack([intro, form])
intro = Text("Żeby ułożyć plan, potrzebuję kilku informacji.")
form = Form("plan", [name, goal, day, areas, note], [send, skip])
name = TextInput("name", "Jak masz na imię?", "np. Ola", true)
goal = TextInput("goal", "Twój główny cel", "np. więcej energii rano")
day = Select("day", "Od którego dnia zaczynamy?", ["Poniedziałek", "Środa", "Sobota"])
areas = CheckboxGroup("areas", "Czym mam się zająć?", ["Sen", "Jedzenie", "Ruch"], true)
note = TextArea("note", "Coś jeszcze?", "Napisz, co jest dla Ciebie ważne")
send = Button("Ułóż plan", "primary")
skip = Button("Bez szczegółów", "secondary")
`;

/** The choices as a program wrote them before buttons lost their action: each sent a message of its own. */
const LEGACY_CHOICES = `root = Stack([intro, choices])
intro = Text("Od czego zaczynamy porządki w projekcie Zdrowie?")
choices = Buttons([sleep, food, moves])
sleep = Button("Sen", @ToAssistant("Zacznijmy od snu"))
food = Button("Jedzenie", @ToAssistant("Zacznijmy od jedzenia"))
moves = Button("Ruch", @ToAssistant("Zacznijmy od ruchu"))
`;

/** The form as a program wrote it before buttons lost their action. */
const LEGACY_FORM = `root = Stack([intro, form])
intro = Text("Żeby ułożyć plan, potrzebuję kilku informacji.")
form = Form("plan", [name, areas], [send, skip])
name = TextInput("name", "Jak masz na imię?", "np. Ola", true)
areas = CheckboxGroup("areas", "Czym mam się zająć?", ["Sen", "Jedzenie", "Ruch"], true)
send = Button("Ułóż plan", @ToAssistant("Ułóż mi plan"), "primary")
skip = Button("Bez szczegółów", @ToAssistant("Ułóż plan bez szczegółów"), "secondary")
`;

/** Screens 78 and 81: the form answered with picks, a dropdown and free text, sent with its first button. */
const FORM_ANSWER: GenerativeUiAnswer = {
    kind: 'generativeUiAnswer',
    source: 'form',
    name: 'plan',
    button: 'Ułóż plan',
    defaultButton: true,
    fields: [
        { name: 'name', label: 'Jak masz na imię?', value: 'Ola' },
        { name: 'day', label: 'Od którego dnia zaczynamy?', value: 'Środa' },
        { name: 'areas', label: 'Czym mam się zająć?', value: ['Sen', 'Jedzenie', 'Ruch'] },
        {
            name: 'note',
            label: 'Coś jeszcze?',
            value:
                'Wstaję o 6 i pracuję zdalnie, więc rano mam trochę czasu dla siebie. Wieczorem za to rzadko mam ' +
                'siłę na cokolwiek, dlatego plan najlepiej, żeby trzymał się poranków.\nW weekendy jeżdżę w góry.',
        },
    ],
};

/** Text, an unknown component, a button that opens a page instead of answering, and a broken last line. */
const BROKEN = `root = Stack([intro, Carousel("slajdy"), choices])
intro = Text("Ten program ma błędy, a pokazuje to, co w nim poprawne.")
choices = Buttons([Button("Rozumiem", @ToAssistant("Rozumiem")), Button("Otwórz stronę", @OpenUrl("https://example.com"))])
extra = Text(("niedomknięte"
`;

/** The agent asks with equal choices, bare under its text; one click answers and the choice keeps its check. */
export const Choices: Story = {
    args: { source: CHOICES, complete: true, active: true },
    render: renderInConversation,
};

/** An earlier reply's buttons: shown, disabled, nothing to click. */
export const ChoicesInactive: Story = {
    args: { source: CHOICES, complete: true, active: false },
    render: renderInConversation,
};

/** Answered by a click: the picked choice keeps its check and outline, and the person's message is its label. */
export const ChoicesAnswered: Story = {
    args: {
        source: CHOICES,
        complete: true,
        active: false,
        answer: {
            kind: 'generativeUiAnswer',
            source: 'choices',
            name: 'choices',
            button: 'Jedzenie',
            defaultButton: true,
            fields: [],
        },
    },
    render: renderInConversation,
};

/** Answered by typing a choice's label: that choice keeps its check too. */
export const ChoicesAnsweredByTyping: Story = {
    args: { source: CHOICES, complete: true, active: false, answer: 'Jedzenie' },
    render: renderInConversation,
};

/** An old program's choices, answered then with a button's message: that button keeps its check. */
export const LegacyChoicesAnswered: Story = {
    args: { source: LEGACY_CHOICES, complete: true, active: false, answer: 'Zacznijmy od jedzenia' },
    render: renderInConversation,
};

/** The choices still streaming: what is written shows, disabled, with the writing caret after it. */
export const StreamingChoices: Story = {
    args: { source: CHOICES.slice(0, CHOICES.indexOf('moves = ')), complete: false, active: false },
    render: renderInConversation,
};

/** The program still streaming, cut off inside the form: what is written so far shows, disabled until complete. */
export const Streaming: Story = {
    args: { source: FORM.slice(0, FORM.indexOf('areas = ') + 40), complete: false, active: false },
    render: renderInConversation,
};

/** A form in its card with each kind of field, the optional ones marked; the first button (or Enter) sends it. */
export const FormActive: Story = {
    args: { source: FORM, complete: true, active: true },
    render: renderInConversation,
};

/** Screens 78 and 81: the form was answered, so it is gone; the person's message shows each answer under its label. */
export const FormAnswered: Story = {
    args: { source: FORM, complete: true, active: false, answer: FORM_ANSWER, answered: true },
    render: renderInConversation,
};

/** Screen 82: sent with another button and nothing filled: the person's message is that button's label alone. */
export const FormSkipped: Story = {
    args: {
        source: FORM,
        complete: true,
        active: false,
        answered: true,
        answer: {
            kind: 'generativeUiAnswer',
            source: 'form',
            name: 'plan',
            button: 'Bez szczegółów',
            defaultButton: false,
            fields: [],
        },
    },
    render: renderInConversation,
};

/** An old program's form still shows its fields and buttons. */
export const LegacyForm: Story = {
    args: { source: LEGACY_FORM, complete: true, active: true },
    render: renderInConversation,
};

/** A passed-over form (the person typed instead, or a later UI took its place): the card loses its fill, its fields and buttons disabled. */
export const FormInactive: Story = {
    args: { source: FORM, complete: true, active: false, answered: true },
    render: renderInConversation,
};

/** Sent with its required fields empty: nothing goes out, and each says so. */
export const FormInvalid: Story = {
    args: { source: FORM, complete: true, active: true },
    render: renderInConversation,
    play: async ({ canvas, userEvent }) => {
        await userEvent.click(canvas.getByRole('button', { name: 'Ułóż plan' }));
    },
};

/** A broken program: its valid part shows, never its code. */
export const Broken: Story = {
    args: { source: BROKEN, complete: true, active: true },
    render: renderInConversation,
};

/**
 * The UI in a reply beside the agent's mark, as a story's args drive it: `onAnswer` sees what it emits, and the answer
 * then shows as the person's message while the UI turns inactive and answered by it.
 */
function renderInConversation({ onAnswer, source, complete, active, answer, answered }: Record<string, unknown>) {
    return defineComponent({
        setup() {
            const sent = ref<GenerativeUiAnswer | null>(null);
            return () => {
                const shown = sent.value ?? readGenerativeUiAnswer(answer);
                return (
                    <div class={styles['conversation']}>
                        <div class={styles['reply']}>
                            <AgentMark />
                            <div class={styles['body']}>
                                <GenerativeUi
                                    source={typeof source === 'string' ? source : ''}
                                    complete={complete === true}
                                    active={active === true && sent.value === null}
                                    answer={shown ?? (typeof answer === 'string' ? answer : undefined)}
                                    answered={answered === true || shown !== undefined || typeof answer === 'string'}
                                    onAnswer={async (value: GenerativeUiAnswer) => {
                                        await (typeof onAnswer === 'function' ? onAnswer(value) : undefined);
                                        sent.value = value;
                                    }}
                                />
                            </div>
                        </div>
                        {shown !== undefined && (
                            <UserMessage
                                text={buildGenerativeUiAnswerText(shown)}
                                answer={shown}
                            />
                        )}
                        {typeof answer === 'string' && <UserMessage text={answer} />}
                    </div>
                );
            };
        },
    });
}
