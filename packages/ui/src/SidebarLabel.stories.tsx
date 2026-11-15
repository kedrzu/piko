import type { Meta, StoryObj } from '@storybook/vue3-vite';

import styles from './ProjectSidebar.stories.module.scss';
import SidebarLabel from './SidebarLabel.vue';

const meta: Meta<typeof SidebarLabel> = { title: 'SidebarLabel', component: SidebarLabel, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof SidebarLabel>;

export const Default: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <SidebarLabel>Pliki</SidebarLabel>
        </div>
    ),
};
