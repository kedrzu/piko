import { ArrowLeft, ExternalLink, History, Link, Trash2 } from '@lucide/vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';

import styles from './Button.stories.module.scss';
import Button from './Button.vue';

const meta: Meta<typeof Button> = { title: 'Button', component: Button, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
    render: () => <Button icon={Link}>Połącz</Button>,
};

export const Secondary: Story = {
    render: () => (
        <Button
            variant="secondary"
            icon={ExternalLink}
        >
            Otwórz stronę logowania ponownie
        </Button>
    ),
};

export const Ghost: Story = {
    render: () => (
        <Button
            variant="ghost"
            icon={ArrowLeft}
        >
            Wróć
        </Button>
    ),
};

/** Pen `atoms/Button/On tint`: on a tinted box, as the run header has it. */
export const OnTint: Story = {
    render: () => (
        <div class={styles['tint']}>
            <Button
                variant="onTint"
                icon={History}
            >
                Wszystkie uruchomienia
            </Button>
        </div>
    ),
};

/** Pen `atoms/Button/Attention`, the delete dialog's confirmation. */
export const Destructive: Story = {
    render: () => (
        <Button
            variant="destructive"
            icon={Trash2}
        >
            Usuń harmonogram
        </Button>
    ),
};

/** A setting's Edit, set in its panel's text. */
export const Inline: Story = {
    render: () => (
        <div class={styles['panel']}>
            <Button variant="inline">Edytuj</Button>
        </div>
    ),
};

export const WithoutIcon: Story = {
    render: () => <Button>Przejdź do aplikacji</Button>,
};

export const Disabled: Story = {
    render: () => (
        <Button
            icon={Link}
            disabled
        >
            Połącz z ChatGPT
        </Button>
    ),
};

export const Busy: Story = {
    render: () => (
        <Button
            icon={Link}
            busy
        >
            Połącz
        </Button>
    ),
};

/** A secondary button disabled, and the answer picked from a row of them: its check and outline stay. */
export const Chosen: Story = {
    render: () => (
        <div style={{ display: 'flex', gap: '8px' }}>
            <Button
                variant="secondary"
                chosen
                disabled
            >
                Dom i dzieci
            </Button>
            <Button
                variant="secondary"
                disabled
            >
                Zdrowie i ruch
            </Button>
        </div>
    ),
};
