import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, ref } from 'vue';

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
sleep = Button("Sen", @ToAssistant("Zacznijmy od snu"))
food = Button("Jedzenie", @ToAssistant("Zacznijmy od jedzenia"))
moves = Button("Ruch", @ToAssistant("Zacznijmy od ruchu"))
`;

const FORM = `root = Stack([intro, form])
intro = Text("Żeby ułożyć plan, potrzebuję kilku informacji.")
form = Form("plan", [name, goal, day, areas, note], [send, skip])
name = TextInput("name", "Jak masz na imię?", "np. Ola", true)
goal = TextInput("goal", "Twój główny cel", "np. więcej energii rano")
day = Select("day", "Od którego dnia zaczynamy?", ["Poniedziałek", "Środa", "Sobota"])
areas = CheckboxGroup("areas", "Czym mam się zająć?", ["Sen", "Jedzenie", "Ruch"], true)
note = TextArea("note", "Coś jeszcze?", "Napisz, co jest dla Ciebie ważne")
send = Button("Ułóż plan", @ToAssistant("Ułóż mi plan"), "primary")
skip = Button("Bez szczegółów", @ToAssistant("Ułóż plan bez szczegółów"), "secondary")
`;

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

/** Answered by a click (or by typing the same words): the picked choice keeps its check and outline. */
export const ChoicesAnswered: Story = {
    args: { source: CHOICES, complete: true, active: false, answer: 'Zacznijmy od jedzenia' },
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

/** An earlier reply's form: the card loses its fill, its fields and buttons disabled. */
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
 * The UI in a reply beside the agent's mark, as a story's args drive it: `onReply` sees what it emits, and the reply
 * then shows as the person's message while the UI turns inactive and answered by it.
 */
function renderInConversation({ onReply, source, complete, active, answer, answered }: Record<string, unknown>) {
    return defineComponent({
        setup() {
            const reply = ref<string | null>(null);
            return () => (
                <div class={styles['conversation']}>
                    <div class={styles['reply']}>
                        <AgentMark />
                        <div class={styles['body']}>
                            <GenerativeUi
                                source={typeof source === 'string' ? source : ''}
                                complete={complete === true}
                                active={active === true && reply.value === null}
                                answer={reply.value ?? (typeof answer === 'string' ? answer : undefined)}
                                answered={answered === true || reply.value !== null || typeof answer === 'string'}
                                onReply={async (text: string) => {
                                    await (typeof onReply === 'function' ? onReply(text) : undefined);
                                    reply.value = text;
                                }}
                            />
                        </div>
                    </div>
                    {reply.value !== null && <UserMessage text={reply.value} />}
                </div>
            );
        },
    });
}
