import type { Meta, StoryObj } from '@storybook/vue3-vite';

import styles from './ScheduleRow.stories.module.scss';
import ScheduleRowHeader from './ScheduleRowHeader.vue';

const meta: Meta<typeof ScheduleRowHeader> = {
    title: 'ScheduleRowHeader',
    component: ScheduleRowHeader,
    tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof ScheduleRowHeader>;

/** Screen 09's table head; `ScheduleRow`'s Table story shows it over its rows. */
export const Default: Story = {
    render: () => (
        <div
            role="table"
            aria-label="Harmonogramy"
            class={styles['table']}
        >
            <ScheduleRowHeader />
        </div>
    ),
};
