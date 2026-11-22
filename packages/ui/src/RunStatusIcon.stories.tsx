import type { Meta, StoryObj } from '@storybook/vue3-vite';

import RunStatusIcon from './RunStatusIcon.vue';
import type { RunStatus } from './RunStatusIcon.vue';
import styles from './RunStatusIcon.stories.module.scss';

const meta: Meta<typeof RunStatusIcon> = { title: 'RunStatusIcon', component: RunStatusIcon, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof RunStatusIcon>;

const STATUSES: RunStatus[] = ['running', 'finished', 'late', 'skipped', 'failed', 'notRun', 'person'];

/** Every status, at the History row's size. */
export const All: Story = {
    render: () => (
        <div class={styles['row']}>
            {STATUSES.map(status => (
                <RunStatusIcon
                    key={status}
                    status={status}
                />
            ))}
        </div>
    ),
};
