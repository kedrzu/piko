import type { Meta, StoryObj } from '@storybook/vue3-vite';

import type { TabBarItem } from './TabBar.vue';
import TabBar from './TabBar.vue';

const meta: Meta<typeof TabBar> = { title: 'TabBar', component: TabBar, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof TabBar>;

const TABS: TabBarItem[] = [
    {
        id: 'c1',
        title: 'Poranna rutyna na zimę',
        to: '/projects/p2/conversations/c1',
        icon: 'conversation',
        color: 'pink',
    },
    {
        id: 'f1',
        title: 'Pomysły na posty',
        to: '/projects/p3/files?path=notatki/Pomysły na posty.md',
        icon: 'note',
    },
    { id: 'memory', title: 'Pamięć', to: '/memory', icon: 'memory', color: 'violet' },
    { id: 'f2', title: 'cover-draft-3.png', to: '/projects/p3/files?path=cover-draft-3.png', icon: 'image' },
];

/** Pen `organisms/Tab bar`: tabs of several kinds, the conversation's showing. */
export const Default: Story = {
    args: { tabs: TABS, activeId: 'c1' },
};

/** The agent at work in a conversation in a tab not showing. */
export const Running: Story = {
    args: {
        tabs: TABS.map(tab => (tab.id === 'c1' ? { ...tab, running: true } : tab)),
        activeId: 'memory',
    },
};

/** More tabs than fit: the bar scrolls sideways. */
export const Overflow: Story = {
    args: {
        tabs: Array.from({ length: 12 }, (_, index) => ({
            id: `c${index}`,
            title: `Rozmowa numer ${index + 1} o czymś ważnym`,
            to: `/projects/p2/conversations/c${index}`,
            icon: 'conversation',
            color: 'blue',
        })),
        activeId: 'c3',
    },
};
