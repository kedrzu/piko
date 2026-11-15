import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { WINTER_ROUTINE_FINISHED } from './AgentMessage.fixtures.js';
import AgentMessage from './AgentMessage.vue';
import Composer from './Composer.vue';
import ConversationLayout from './ConversationLayout.vue';
import styles from './ConversationLayout.stories.module.scss';
import FileChip from './FileChip.vue';
import FileLayout from './FileLayout.vue';
import { POST_IDEAS_MARKDOWN } from './MarkdownEditor.fixtures.js';
import MarkdownEditor from './MarkdownEditor.vue';
import SideView from './SideView.vue';
import UserMessage from './UserMessage.vue';

const meta: Meta<typeof ConversationLayout> = {
    title: 'ConversationLayout',
    component: ConversationLayout,
    tags: ['autodocs'],
    parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof ConversationLayout>;

/** More messages than fit: the column scrolls, opened at the newest. */
export const Scrolling: Story = {
    render: () => (
        <div class={styles['card']}>
            <ConversationLayout>
                {{
                    default: () =>
                        [1, 2, 3].flatMap(round => [
                            <UserMessage
                                key={`u${round}`}
                                text={`Pytanie ${round}: ułóż mi poranną rutynę na zimę.`}
                            />,
                            <AgentMessage
                                key={`a${round}`}
                                parts={WINTER_ROUTINE_FINISHED}
                            />,
                        ]),
                    footer: () => <Composer placeholder="Napisz do agenta…" />,
                }}
            </ConversationLayout>
        </div>
    ),
};

/** Frame 26: a file the agent wrote, open beside the conversation, which narrows to its column. */
export const WithSideView: Story = {
    render: () => (
        <div class={styles['card']}>
            <ConversationLayout>
                {{
                    default: () => [
                        <UserMessage
                            key="u"
                            text="Ułóż mi poranną rutynę na zimę i zapisz plan."
                        />,
                        <AgentMessage
                            key="a"
                            parts={WINTER_ROUTINE_FINISHED}
                        >
                            {{
                                file: () => (
                                    <FileChip
                                        title="plan"
                                        kind="note"
                                        place="Zdrowie"
                                        to="/plan"
                                    />
                                ),
                            }}
                        </AgentMessage>,
                    ],
                    footer: () => <Composer placeholder="Napisz do agenta…" />,
                    aside: () => (
                        <SideView
                            title="plan"
                            kind="note"
                            place="Zdrowie"
                        >
                            <FileLayout title="plan">
                                <MarkdownEditor
                                    markdown={POST_IDEAS_MARKDOWN}
                                    label="plan"
                                />
                            </FileLayout>
                        </SideView>
                    ),
                }}
            </ConversationLayout>
        </div>
    ),
};
