import { CalendarX } from '@lucide/vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';

import styles from './Button.stories.module.scss';
import ScheduleTile from './ScheduleTile.vue';

const meta: Meta<typeof ScheduleTile> = { title: 'ScheduleTile', component: ScheduleTile, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof ScheduleTile>;

/** In a schedule's row. */
export const Small: Story = {};

/** Over a schedule's screen and the empty Schedules screen. */
export const Large: Story = {
    args: { large: true },
};

/** On the run header's tint. */
export const OnTint: Story = {
    render: () => (
        <div class={styles['tint']}>
            <ScheduleTile onTint />
        </div>
    ),
};

/** A schedule that is gone (screen 80). */
export const Gone: Story = {
    args: { large: true, icon: CalendarX },
};
