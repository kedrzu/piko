import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, onMounted, ref } from 'vue';

import {
    AGENT_MARKDOWN,
    EMPTY_MARKDOWN,
    MEMORY_NOTE_MARKDOWN,
    POST_IDEAS_MARKDOWN,
} from './MarkdownEditor.fixtures.js';
import MarkdownEditor from './MarkdownEditor.vue';

/** The open file as the screen holding the editor sees it: a spec rewrites it from outside, as the agent does. */
export interface MarkdownEditorStoryFile {
    rewrite: (markdown: string) => void;
}

/** The editor's props and listeners, plus a hook handing a spec the open file. */
export interface MarkdownEditorStoryArgs {
    markdown: string;
    syntax?: boolean;
    label?: string;
    readonly?: boolean;
    'onUpdate:markdown'?: (markdown: string) => void;
    'onUpdate:syntax'?: (syntax: boolean) => void;
    onOpen?: (file: MarkdownEditorStoryFile) => void;
}

const meta: Meta<MarkdownEditorStoryArgs> = {
    title: 'MarkdownEditor',
    component: MarkdownEditor,
    tags: ['autodocs'],
    render: renderEditor,
};
export default meta;
type Story = StoryObj<MarkdownEditorStoryArgs>;

/** Screen 34: a Memory note open in the editor. */
export const MemoryNote: Story = { args: { markdown: MEMORY_NOTE_MARKDOWN } };

/** Screen 06: the project file "Pomysły na posty". */
export const PostIdeas: Story = { args: { markdown: POST_IDEAS_MARKDOWN, label: 'Pomysły na posty' } };

/** What an agent writes: tables, nested and task lists, front matter, and the constructs kept as their source. */
export const AgentFile: Story = { args: { markdown: AGENT_MARKDOWN } };

/** The plain Markdown source instead of the formatted text. */
export const SyntaxView: Story = { args: { markdown: MEMORY_NOTE_MARKDOWN, syntax: true } };

/** A file shown without letting it change: gone from disk, or the agent writing it. */
export const ReadOnly: Story = { args: { markdown: POST_IDEAS_MARKDOWN, label: 'Pomysły na posty', readonly: true } };

/** A file with nothing in it yet. */
export const Empty: Story = { args: { markdown: EMPTY_MARKDOWN } };

/**
 * The editor under a parent that owns the file, as a screen does: what the editor reports is passed back to it, and
 * `onOpen` hands a spec the way to rewrite the file from outside. The listeners are taken out of `args`, or JSX would
 * merge them with the parent's own.
 */
function renderEditor({
    markdown: initial,
    syntax: initialSyntax,
    'onUpdate:markdown': onUpdateMarkdown,
    'onUpdate:syntax': onUpdateSyntax,
    onOpen,
    ...args
}: MarkdownEditorStoryArgs) {
    return defineComponent({
        setup() {
            const markdown = ref(initial);
            const syntax = ref(initialSyntax ?? false);

            onMounted(() => {
                onOpen?.({ rewrite: value => (markdown.value = value) });
            });

            return () => (
                <MarkdownEditor
                    {...args}
                    markdown={markdown.value}
                    syntax={syntax.value}
                    onUpdate:markdown={(value: string) => {
                        markdown.value = value;
                        onUpdateMarkdown?.(value);
                    }}
                    onUpdate:syntax={(value: boolean) => {
                        syntax.value = value;
                        onUpdateSyntax?.(value);
                    }}
                />
            );
        },
    });
}
