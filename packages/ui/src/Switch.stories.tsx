import type { Meta, StoryObj } from '@storybook/vue3-vite';

import Switch from './Switch.vue';

const meta: Meta<typeof Switch> = { title: 'Switch', component: Switch, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Switch>;

/** Pen `atoms/Switch/On`. It stays on until the parent passes the new state back. */
export const On: Story = {
    args: { modelValue: true, label: 'Sortuj moją pocztę' },
};

/** Pen `atoms/Switch/Off`. */
export const Off: Story = {
    args: { modelValue: false, label: 'Faktury za remont' },
};

/** While the parent waits for the daemon to accept the change. */
export const Disabled: Story = {
    args: { modelValue: true, label: 'Sortuj moją pocztę', disabled: true },
};
