import type { Meta, StoryObj } from '@storybook/vue3-vite';

import CsvPreview from './CsvPreview.vue';
import FileElsewhere from './FileElsewhere.vue';
import { STEPS_CSV, SUNRISE_IMAGE } from './FileLayout.fixtures.js';
import styles from './FileLayout.stories.module.scss';
import FileLayout from './FileLayout.vue';
import ImagePreview from './ImagePreview.vue';
import { POST_IDEAS_MARKDOWN } from './MarkdownEditor.fixtures.js';
import MarkdownEditor from './MarkdownEditor.vue';
import StatusBanner from './StatusBanner.vue';

const meta: Meta<typeof FileLayout> = {
    title: 'FileLayout',
    component: FileLayout,
    tags: ['autodocs'],
    parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof FileLayout>;

/** Frame 06: a Markdown file in the editor, in the centred column. */
export const Document: Story = {
    render: () => (
        <div class={styles['card']}>
            <FileLayout title="Pomysły na posty">
                <MarkdownEditor
                    markdown={POST_IDEAS_MARKDOWN}
                    label="Pomysły na posty"
                />
            </FileLayout>
        </div>
    ),
};

/** A save failed: the text stays in the editor under the banner. */
export const NotSaved: Story = {
    render: () => (
        <div class={styles['card']}>
            <FileLayout title="Pomysły na posty">
                {{
                    banner: () => (
                        <StatusBanner
                            title="Nie zapisano"
                            body="Twój tekst jest tutaj bezpieczny. Zapis ponowi się, gdy będziesz pisać."
                            actionLabel="Spróbuj ponownie"
                        />
                    ),
                    default: () => (
                        <MarkdownEditor
                            markdown={POST_IDEAS_MARKDOWN}
                            label="Pomysły na posty"
                        />
                    ),
                }}
            </FileLayout>
        </div>
    ),
};

/** The file was deleted while open: read-only under the banner. */
export const Gone: Story = {
    render: () => (
        <div class={styles['card']}>
            <FileLayout title="Pomysły na posty">
                {{
                    banner: () => (
                        <StatusBanner
                            title="Tego pliku już nie ma"
                            body="Został usunięty albo przeniesiony poza aplikacją."
                        />
                    ),
                    default: () => (
                        <MarkdownEditor
                            markdown={POST_IDEAS_MARKDOWN}
                            label="Pomysły na posty"
                            readonly
                        />
                    ),
                }}
            </FileLayout>
        </div>
    ),
};

/** Frame 18, for a CSV file: the head with Open in default app, the table and the note under it. */
export const Spreadsheet: Story = {
    render: () => (
        <div class={styles['card']}>
            <FileLayout
                title="results.csv"
                variant="preview"
                meta="Arkusz · ostatnia zmiana: wczoraj"
                openable
            >
                <CsvPreview text={STEPS_CSV} />
            </FileLayout>
        </div>
    ),
};

/** An image, contained under the same head. */
export const Image: Story = {
    render: () => (
        <div class={styles['card']}>
            <FileLayout
                title="cover-draft-3.png"
                variant="preview"
                meta="Obraz · ostatnia zmiana: dziś o 09:12"
                openable
            >
                <ImagePreview
                    src={SUNRISE_IMAGE}
                    alt="cover-draft-3.png"
                />
            </FileLayout>
        </div>
    ),
};

/** A file the app does not show, in the document column. */
export const Elsewhere: Story = {
    render: () => (
        <div class={styles['card']}>
            <FileLayout title="budżet.xlsx">
                <FileElsewhere
                    name="budżet.xlsx"
                    openable
                />
            </FileLayout>
        </div>
    ),
};
