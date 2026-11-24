import type { Meta, StoryObj } from '@storybook/vue3-vite';

import Tab from './Tab.vue';

const meta: Meta<typeof Tab> = { title: 'Tab', component: Tab, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Tab>;

/** Pen `molecules/Tab/Active`: the screen showing now, with its ×. */
export const Active: Story = {
    render: () => (
        <Tab
            title="Poranna rutyna na zimę"
            to="/projects/p2/conversations/c1"
            icon="conversation"
            color="pink"
            active
        />
    ),
};

/** Pen `molecules/Tab/Default`: another open tab, muted, no ×. */
export const Inactive: Story = {
    render: () => (
        <Tab
            title="Krem z filtrem — co wybrać"
            to="/projects/p2/conversations/c2"
            icon="conversation"
            color="pink"
        />
    ),
};

/** The agent at work in the conversation. */
export const Running: Story = {
    render: () => (
        <Tab
            title="Poranna rutyna na zimę"
            to="/projects/p2/conversations/c1"
            icon="conversation"
            color="pink"
            running
            active
        />
    ),
};

export const Memory: Story = {
    render: () => (
        <Tab
            title="Pamięć"
            to="/memory"
            icon="memory"
            color="violet"
        />
    ),
};

export const Schedules: Story = {
    render: () => (
        <Tab
            title="Harmonogramy"
            to="/schedules"
            icon="schedule"
        />
    ),
};

export const Schedule: Story = {
    render: () => (
        <Tab
            title="Sortuj moją pocztę"
            to="/projects/p1/schedules/s1"
            icon="schedule"
            color="green"
        />
    ),
};

export const Note: Story = {
    render: () => (
        <Tab
            title="Pomysły na posty"
            to="/projects/p3/files?path=notatki/Pomysły na posty.md"
            icon="note"
            active
        />
    ),
};

export const Spreadsheet: Story = {
    render: () => (
        <Tab
            title="budżet.xlsx"
            to="/projects/p3/files?path=budżet.xlsx"
            icon="spreadsheet"
        />
    ),
};

export const Image: Story = {
    render: () => (
        <Tab
            title="cover-draft-3.png"
            to="/projects/p3/files?path=cover-draft-3.png"
            icon="image"
        />
    ),
};

export const OtherFile: Story = {
    render: () => (
        <Tab
            title="umowa.pdf"
            to="/projects/p1/files?path=umowa.pdf"
            icon="file"
        />
    ),
};

/** A title too long for the tab ends in an ellipsis. */
export const LongTitle: Story = {
    render: () => (
        <Tab
            title="Przeprowadzka do Wrocławia i wszystko, co trzeba przy niej załatwić"
            to="/projects/p4/conversations/c9"
            icon="conversation"
            color="violet"
            active
        />
    ),
};
