import type { Meta, StoryObj } from '@storybook/vue3-vite';

import ScheduleDeleteDialog from './ScheduleDeleteDialog.vue';

const meta: Meta<typeof ScheduleDeleteDialog> = {
    title: 'ScheduleDeleteDialog',
    component: ScheduleDeleteDialog,
    tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof ScheduleDeleteDialog>;

/** Screen 78. */
export const Open: Story = {
    args: { name: 'Sortuj moją pocztę', projectName: 'Poczta', open: true },
};

/** Deleting: Delete schedule busy until the deletion settles. */
export const Deleting: Story = {
    args: { ...Open.args, onConfirm: () => new Promise<void>(() => {}) },
};
