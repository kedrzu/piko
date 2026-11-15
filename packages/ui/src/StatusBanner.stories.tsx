import { Hourglass, LogIn, PencilLine, Play, Square } from '@lucide/vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';

import Button from './Button.vue';
import StatusBanner from './StatusBanner.vue';

const meta: Meta<typeof StatusBanner> = { title: 'StatusBanner', component: StatusBanner, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof StatusBanner>;

/** Screen 60: signed out of Claude. */
export const SignedOut: Story = {
    render: () => (
        <StatusBanner
            title="Wylogowano Cię z Claude"
            body="Agent nie odpowie, dopóki nie zalogujesz się ponownie. Twoja wiadomość zostaje w rozmowie."
            actionLabel="Zaloguj się ponownie"
            actionIcon={LogIn}
        />
    ),
};

/** Screen 61: the usage limit, nothing to do but wait. */
export const UsageLimit: Story = {
    render: () => (
        <StatusBanner
            title="Wykorzystano limit Claude"
            body="Limit odnowi się w czwartek o 14:00. Wtedy agent znów odpowie."
        />
    ),
};

/** A project file changed by the agent under the person's unsaved text: two ways out. */
export const TwoActions: Story = {
    render: () => (
        <StatusBanner
            title="Agent zmienił ten plik w międzyczasie"
            body="Ty i agent zmieniliście ten sam fragment, więc na razie nic nie zapisano. Wybierz, którą wersję zachować."
        >
            {{
                actions: () => [
                    <Button variant="attention">Zostaw moje</Button>,
                    <Button variant="attention">Weź wersję agenta</Button>,
                ],
            }}
        </StatusBanner>
    ),
};

/** Frame 06: the agent writing in the open file, which the person can stop. */
export const AgentWriting: Story = {
    render: () => (
        <StatusBanner
            tone="agent"
            icon={PencilLine}
            title="Agent pisze w tym pliku"
            body="Znów będziesz móc edytować, gdy skończy. Możesz też zatrzymać go teraz."
            actionLabel="Zatrzymaj agenta"
            actionIcon={Square}
        />
    ),
};

/** Frame 31: the agent holds its change to the open file while the person types in it. */
export const AgentWaiting: Story = {
    render: () => (
        <StatusBanner
            tone="waiting"
            icon={Hourglass}
            title="Agent czeka, żeby zmienić ten plik"
            body="Piszesz w tym pliku, więc agent wstrzymuje swoją zmianę, aż przestaniesz na minutę. Samo otwarcie pliku go nie zatrzymuje, tylko edycja."
            actionLabel="Pozwól mu pisać teraz"
            actionIcon={Play}
        />
    ),
};
