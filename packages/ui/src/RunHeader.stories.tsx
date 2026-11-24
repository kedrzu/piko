import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h } from 'vue';

import RunHeader from './RunHeader.vue';
import styles from './RunHeader.stories.module.scss';

const meta: Meta<typeof RunHeader> = {
    title: 'RunHeader',
    component: RunHeader,
    tags: ['autodocs'],
    decorators: [
        story => {
            const Story = story();
            return defineComponent({
                setup: () => () => <div class={styles['column']}>{h(Story)}</div>,
            });
        },
    ],
};
export default meta;
type Story = StoryObj<typeof RunHeader>;

/** Pen `molecules/Run header`: a late run, with why. */
export const Default: Story = {
    args: {
        scheduleName: 'Sprawdzanie ofert na LinkedIn',
        detail: 'Na wt 7:00 · ruszyło 7:42, Mac spał do tej pory',
        runsLink: '/schedules/s2',
        scheduleLink: '/schedules/s2',
    },
};

/** The run is no longer known: the name only. */
export const NameOnly: Story = {
    args: {
        scheduleName: 'Sprawdzanie ofert na LinkedIn',
        runsLink: '/schedules/s2',
        scheduleLink: '/schedules/s2',
    },
};
