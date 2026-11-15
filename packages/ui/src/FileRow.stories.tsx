import type { Meta, StoryObj } from '@storybook/vue3-vite';

import FileRow from './FileRow.vue';
import styles from './ProjectSidebar.stories.module.scss';

const meta: Meta<typeof FileRow> = { title: 'FileRow', component: FileRow, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof FileRow>;

/** Each file type's icon, and a file inside a folder indented a step. */
export const Files: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <FileRow
                label="Plan treningów"
                kind="note"
                to="/projects/p2/files?path=Plan%20trening%C3%B3w.md"
            />
            <FileRow
                label="wyniki-badan.csv"
                kind="spreadsheet"
                to="/projects/p2/files?path=wyniki-badan.csv"
            />
            <FileRow
                label="zdjecie-skory.jpg"
                kind="image"
                to="/projects/p2/files?path=zdjecie-skory.jpg"
            />
            <FileRow
                label="skierowanie.pdf"
                kind="file"
                depth={1}
                to="/projects/p2/files?path=dokumenty/skierowanie.pdf"
            />
        </div>
    ),
};

/** The file open now. */
export const Selected: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <FileRow
                label="Plan treningów"
                kind="note"
                to="/projects/p2/files?path=Plan%20trening%C3%B3w.md"
                selected
            />
        </div>
    ),
};

/** The file open now while the agent writes in it: a pencil instead of its type's icon. */
export const Writing: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <FileRow
                label="Plan treningów"
                kind="note"
                to="/projects/p2/files?path=Plan%20trening%C3%B3w.md"
                selected
                writing
            />
        </div>
    ),
};

/** The file open now while the agent waits to change it: an hourglass instead of its type's icon. */
export const Waiting: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <FileRow
                label="Plan treningów"
                kind="note"
                to="/projects/p2/files?path=Plan%20trening%C3%B3w.md"
                selected
                waiting
            />
        </div>
    ),
};

export const Folder: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <FileRow
                label="dokumenty"
                kind="folder"
            />
        </div>
    ),
};

export const FolderExpanded: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <FileRow
                label="dokumenty"
                kind="folder"
                expanded
            />
        </div>
    ),
};

export const LongName: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <FileRow
                label="Lista pytań do dermatologa przed wizytą kontrolną w marcu"
                kind="note"
                depth={2}
                to="/projects/p2/files?path=a/b/Lista.md"
            />
        </div>
    ),
};
