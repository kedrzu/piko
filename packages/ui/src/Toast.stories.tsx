import { CircleArrowDown, RotateCw, Undo2 } from '@lucide/vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, ref } from 'vue';

import Button from './Button.vue';
import Toast from './Toast.vue';
import Toaster from './Toaster.vue';

const meta: Meta<typeof Toast> = {
    title: 'Toast',
    component: Toast,
    tags: ['autodocs'],
    parameters: {
        a11y: {
            context: {
                // reka-ui's toast viewport puts a focus guard on each side of it, empty, `aria-hidden` and focusable,
                // that hands focus on to the toasts or out of them (F8). axe flags them; they hide nothing. Only they
                // are left out: every rule still runs on the rest.
                exclude: ['[role="region"] > span[aria-hidden="true"][tabindex="0"]'],
            },
        },
    },
};
export default meta;
type Story = StoryObj<typeof Toast>;

/** `molecules/Toast`: an outcome, nothing wrong; stays until closed. */
export const Neutral: Story = {
    render: () => (
        <Toaster>
            <Toast title="Tytuł powiadomienia">Krótki opis tego, co się stało.</Toast>
        </Toaster>
    ),
};

/** `molecules/Toast/Accent`: news worth acting on. */
export const Accent: Story = {
    render: () => (
        <Toaster>
            <Toast
                title="Coś nowego, warto zareagować"
                tone="accent"
            >
                Ton accent: wiadomość, na którą warto odpowiedzieć.
            </Toast>
        </Toaster>
    ),
};

/** `molecules/Toast/Warning`: something failed and can be tried again. */
export const Warning: Story = {
    render: () => (
        <Toaster>
            <Toast
                title="Coś poszło nie tak"
                tone="warning"
            >
                Ton warning: błąd, który można ponowić.
            </Toast>
        </Toaster>
    ),
};

/** `molecules/Toast/Timed`: closes by itself, counting down in the ring around the ×; "Pokaż" opens it again. */
export const Timed: Story = {
    args: { open: true },
    render: args =>
        defineComponent({
            setup() {
                const open = ref(args.open);
                return () => (
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => (open.value = true)}
                        >
                            Pokaż
                        </Button>
                        <Toaster>
                            <Toast
                                v-model:open={open.value}
                                title="Zamknie się samo"
                                lasts="timed"
                            >
                                Pierścień wokół × odlicza kilka sekund do zamknięcia.
                            </Toast>
                        </Toaster>
                    </>
                );
            },
        }),
};

/** `Toast · neutral, timed, with action`: an Undo while it counts down. */
export const WithAction: Story = {
    render: () => (
        <Toaster>
            <Toast
                title="Plik przeniesiony do kosza"
                lasts="timed"
            >
                {{
                    default: () => 'notatki-z-wizyty.md',
                    actions: () => (
                        <Button
                            variant="secondary"
                            icon={Undo2}
                        >
                            Cofnij
                        </Button>
                    ),
                }}
            </Toast>
        </Toaster>
    ),
};

/** `Toast · long text`: a two-line title and a three-line description wrap inside the same width. */
export const LongText: Story = {
    render: () => (
        <Toaster>
            <Toast
                title="Nie udało się zapisać pliku „Plan treningowy na listopad i grudzień.xlsx”"
                tone="warning"
            >
                {{
                    default: () =>
                        'Dysk jest pełny albo plik jest otwarty w innym programie. Zamknij go i spróbuj jeszcze raz — twoje zmiany są bezpieczne.',
                    actions: () => <Button icon={RotateCw}>Spróbuj ponownie</Button>,
                }}
            </Toast>
        </Toaster>
    ),
};

/** The × disabled while closing would cut something short: a restart under way. */
export const NotClosable: Story = {
    render: () => (
        <Toaster>
            <Toast
                title="Nowa wersja poweragents jest gotowa"
                tone="accent"
                icon={CircleArrowDown}
                closable={false}
            >
                {{
                    default: () => 'Za chwilę poweragents uruchomi się ponownie.',
                    actions: () => (
                        <Button
                            icon={RotateCw}
                            busy
                        >
                            Uruchom ponownie
                        </Button>
                    ),
                }}
            </Toast>
        </Toaster>
    ),
};
