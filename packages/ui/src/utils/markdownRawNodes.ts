import { mergeAttributes, Node } from '@tiptap/core';

/**
 * A block of Markdown the editor has no node for — HTML, a footnote or link definition, a list or quote whose shape
 * the schema rejects. It holds the exact source and is written back unchanged, so nothing the agent wrote is lost;
 * it cannot be edited in place.
 */
export const MarkdownRaw = Node.create({
    name: 'markdownRaw',
    group: 'block',
    atom: true,
    selectable: true,
    addAttributes() {
        return { source: { default: '', rendered: false } };
    },
    parseHTML() {
        return [
            {
                tag: 'pre[data-markdown-raw]',
                preserveWhitespace: 'full',
                getAttrs: element => ({ source: element.textContent }),
            },
        ];
    },
    renderHTML({ node, HTMLAttributes }) {
        return ['pre', mergeAttributes(HTMLAttributes, { 'data-markdown-raw': '' }), readSource(node.attrs)];
    },
});

/**
 * Inline Markdown the editor has no mark or node for — inline HTML, an image, a footnote reference — kept as its
 * exact source and written back unchanged.
 */
export const MarkdownRawInline = Node.create({
    name: 'markdownRawInline',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    addAttributes() {
        return { source: { default: '', rendered: false } };
    },
    parseHTML() {
        return [{ tag: 'code[data-markdown-raw-inline]', getAttrs: element => ({ source: element.textContent }) }];
    },
    renderHTML({ node, HTMLAttributes }) {
        return ['code', mergeAttributes(HTMLAttributes, { 'data-markdown-raw-inline': '' }), readSource(node.attrs)];
    },
});

function readSource(attrs: Record<string, unknown>): string {
    const source = attrs['source'];
    return typeof source === 'string' ? source : '';
}
