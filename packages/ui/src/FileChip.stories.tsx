import type { Meta, StoryObj } from '@storybook/vue3-vite';

import FileChip from './FileChip.vue';

const meta: Meta<typeof FileChip> = { title: 'FileChip', component: FileChip, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof FileChip>;

/** A note the agent wrote, with its project's name. */
export const Written: Story = {
    args: { title: 'Pomysły na posty', kind: 'note', place: 'Blog', to: '/projects/p1/conversations/c1?file=x' },
};

/** The agent is writing it now. */
export const Writing: Story = {
    args: { ...Written.args, writing: true },
};

/** Each file type's icon. */
export const Kinds: Story = {
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
            <FileChip
                title="wyniki-badan.csv"
                kind="spreadsheet"
                place="Zdrowie"
                to="/a"
            />
            <FileChip
                title="okladka.png"
                kind="image"
                place="Zdrowie"
                to="/b"
            />
            <FileChip
                title="skierowanie.pdf"
                kind="file"
                place="Zdrowie"
                to="/c"
            />
        </div>
    ),
};

/** A name longer than the column: cut with an ellipsis, the rest of the chip kept. */
export const LongName: Story = {
    render: () => (
        <div style={{ width: '280px' }}>
            <FileChip
                title="Bardzo długa nazwa notatki o planie treningów na całą zimę"
                kind="note"
                place="Zdrowie"
                to="/d"
            />
        </div>
    ),
};
