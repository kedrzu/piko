import { CircleArrowDown, FolderPlus, RotateCw } from '@lucide/vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, ref } from 'vue';

import Button from './Button.vue';
import Toast from './Toast.vue';
import Toaster from './Toaster.vue';

const meta: Meta<typeof Toaster> = {
    title: 'Toaster',
    component: Toaster,
    tags: ['autodocs'],
    parameters: {
        a11y: {
            context: {
                // The focus guards around reka-ui's toast viewport, as in `Toast.stories.tsx`.
                exclude: ['[role="region"] > span[aria-hidden="true"][tabindex="0"]'],
            },
        },
    },
};
export default meta;
type Story = StoryObj<typeof Toaster>;

/** `molecules/Toaster`: two toasts stacked in the corner, the newest at the bottom. */
export const Stack: Story = {
    render: () => (
        <Toaster>
            <Toast
                title="Projekt „Faktury” utworzony"
                icon={FolderPlus}
                lasts="timed"
            >
                Znajdziesz go w pasku bocznym.
            </Toast>
            <Toast
                title="Nowa wersja piko jest gotowa"
                tone="accent"
                icon={CircleArrowDown}
            >
                {{
                    default: () =>
                        'Uruchom ponownie, żeby przejść na 0.1.0-dev.215. Do tego czasu działasz na 0.1.0-dev.214.',
                    actions: () => <Button icon={RotateCw}>Uruchom ponownie</Button>,
                }}
            </Toast>
        </Toaster>
    ),
};

/** A toast that opens later goes to the bottom of the stack, wherever it stands in the markup. */
export const OpensLater: Story = {
    render: () =>
        defineComponent({
            setup() {
                const later = ref(false);
                return () => (
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => (later.value = true)}
                        >
                            Pokaż drugie
                        </Button>
                        <Toaster>
                            <Toast
                                v-model:open={later.value}
                                title="Otwarte później"
                            />
                            <Toast title="Otwarte od początku" />
                        </Toaster>
                    </>
                );
            },
        }),
};
