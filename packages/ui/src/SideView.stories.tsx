import type { Meta, StoryObj } from '@storybook/vue3-vite';

import styles from './ConversationLayout.stories.module.scss';
import FileLayout from './FileLayout.vue';
import { POST_IDEAS_MARKDOWN } from './MarkdownEditor.fixtures.js';
import MarkdownEditor from './MarkdownEditor.vue';
import SideView from './SideView.vue';

const meta: Meta<typeof SideView> = {
    title: 'SideView',
    component: SideView,
    tags: ['autodocs'],
    parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof SideView>;

/** Frame 26's document pane: the bar over a note in the editor. */
export const Note: Story = {
    render: () => (
        <div class={styles['card']}>
            <SideView
                title="Pomysły na posty"
                kind="note"
                place="Blog"
            >
                <FileLayout title="Pomysły na posty">
                    <MarkdownEditor
                        markdown={POST_IDEAS_MARKDOWN}
                        label="Pomysły na posty"
                    />
                </FileLayout>
            </SideView>
        </div>
    ),
};
