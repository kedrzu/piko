import type { Meta, StoryObj } from '@storybook/vue3-vite';

import styles from './Wordmark.stories.module.scss';
import Wordmark from './Wordmark.vue';

const meta: Meta<typeof Wordmark> = { title: 'Wordmark', component: Wordmark, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Wordmark>;

export const OnLight: Story = { render: () => <Wordmark /> };

/** On the first run's dark story panel, where the letters take its light text colour. */
export const OnDark: Story = {
    render: () => (
        <div class={styles.dark}>
            <Wordmark />
        </div>
    ),
};
