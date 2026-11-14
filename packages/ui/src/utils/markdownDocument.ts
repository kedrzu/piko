import { getSchema } from '@tiptap/core';
import type { Extensions, JSONContent } from '@tiptap/core';
import { Code } from '@tiptap/extension-code';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { StarterKit } from '@tiptap/starter-kit';
import type {
    AlignType,
    BlockContent,
    Definition,
    Link,
    LinkReference,
    ListItem,
    Nodes,
    PhrasingContent,
    Root,
    RootContent,
    Table as MdastTable,
    TableCell as MdastTableCell,
    TableRow as MdastTableRow,
} from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { gfmFromMarkdown, gfmToMarkdown } from 'mdast-util-gfm';
import { toMarkdown } from 'mdast-util-to-markdown';
import type { Options as ToMarkdownOptions } from 'mdast-util-to-markdown';
import { frontmatter } from 'micromark-extension-frontmatter';
import { gfm } from 'micromark-extension-gfm';

import { assert } from '@nzyme/utils/assert.js';
import { isExternalLinkUrl } from '@poweragents/common/utils/isExternalLinkUrl.js';

import { MarkdownRaw, MarkdownRawInline } from './markdownRawNodes.js';

/** A Markdown file split into what the editor shows and what it keeps aside to write back unchanged. */
export interface MarkdownDocument {
    /** The front matter with the line breaks that follow it, byte for byte as in the file; never shown in the editor. */
    frontMatter: string | undefined;
    /** The file's line ending, taken from its first line break; the body is written back with it. */
    eol: MarkdownLineEnding;
    /** The body as Tiptap JSON, valid against `MarkdownEditorExtensions`. */
    doc: JSONContent;
}

/** The line endings a Markdown file keeps. */
export type MarkdownLineEnding = '\n' | '\r\n';

/**
 * The editor's extensions, matching what Markdown can express: no underline, code that can sit inside a link or
 * emphasis, table cells holding paragraphs only (a Markdown cell is one line), and atoms keeping what has no node.
 * A link keeps whatever address it has, but only an external one (`isExternalLinkUrl`) can be added by a command,
 * an autolink or a paste; clicking a link never opens it.
 */
export const MarkdownEditorExtensions: Extensions = [
    StarterKit.configure({
        underline: false,
        code: false,
        // The trailing paragraph is appended on any transaction, a click included: an untouched file would change.
        trailingNode: false,
        link: {
            openOnClick: false,
            defaultProtocol: 'https',
            isAllowedUri: isExternalLinkUrl,
            // Link-on-paste checks only this one, never `isAllowedUri`.
            shouldAutoLink: isExternalLinkUrl,
        },
    }),
    // Markdown nests inline code in links and emphasis (`[`file.ts`](file.ts)`); Tiptap's code excludes every mark.
    Code.extend({ excludes: '' }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table,
    TableRow,
    TableHeader.extend({ content: 'paragraph+' }),
    TableCell.extend({ content: 'paragraph+' }),
    MarkdownRaw,
    MarkdownRawInline,
];

/** A Tiptap JSON node or mark, as far as reading its attributes goes. */
interface Attributed {
    attrs?: Record<string, unknown>;
}

/** A mark as it sits in Tiptap JSON. */
interface EditorMark extends Attributed {
    type: string;
}

/** What reading inline content needs to know about where it is. */
interface ReadContext {
    /** The body the mdast positions point into. */
    source: string;
    /** Link definitions by identifier, the first one winning, as Markdown resolves them. */
    definitions: Map<string, Definition>;
    /** Inside a list or a quote, where a multi-line raw slice carries the container's indentation. */
    nested: boolean;
    /** Inside a table cell, where `<br>` is the line break. */
    inCell: boolean;
}

/** An inline node on its way back to mdast, with the marks not yet turned into containers. */
interface InlineItem {
    node: JSONContent;
    marks: EditorMark[];
    code: boolean;
}

/** Thrown inside a top-level block that has no editor mapping, so the whole block is kept as raw source. */
class UnmappableError extends Error {}

const schema = getSchema(MarkdownEditorExtensions);

const TO_MARKDOWN_OPTIONS: ToMarkdownOptions = {
    extensions: [gfmToMarkdown()],
    bullet: '-',
    emphasis: '*',
    rule: '-',
    fences: true,
};

const CELL_BREAK = '<br>';

/**
 * Reads a Markdown file for the editor. Front matter is split off verbatim; anything the editor cannot represent
 * becomes a raw atom holding its exact source. Never throws.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseMarkdown(markdown: string): MarkdownDocument {
    const eol = /\r?\n/.exec(markdown)?.[0] === '\r\n' ? '\r\n' : '\n';
    const frontMatter = splitFrontMatter(markdown);
    const body = markdown.slice(frontMatter?.length ?? 0).replaceAll('\r\n', '\n');
    return { frontMatter, eol, doc: readBody(body) };
}

/**
 * Writes an edited document back to Markdown: front matter unchanged, the body through mdast with the file's line
 * endings, raw atoms as their source.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function serializeMarkdown(document: MarkdownDocument): string {
    const root: Root = { type: 'root', children: writeBlocks(document.doc.content ?? []) };
    const body = toMarkdown(root, TO_MARKDOWN_OPTIONS);
    return (document.frontMatter ?? '') + (document.eol === '\n' ? body : body.replaceAll('\n', '\r\n'));
}

function splitFrontMatter(markdown: string): string | undefined {
    const tree = fromMarkdown(markdown, {
        extensions: [frontmatter()],
        mdastExtensions: [frontmatterFromMarkdown()],
    });
    const first = tree.children[0];
    if (first?.type !== 'yaml') {
        return undefined;
    }

    const end = first.position?.end.offset;
    assert(end != null, 'Front matter has no position');
    const separator = /^(?:[ \t]*\r?\n)*/.exec(markdown.slice(end));
    return markdown.slice(0, end + (separator?.[0].length ?? 0));
}

function readBody(body: string): JSONContent {
    const tree = fromMarkdown(body, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
    const context: ReadContext = {
        source: body,
        definitions: collectDefinitions(tree),
        nested: false,
        inCell: false,
    };
    const content = tree.children.map(node => readTopLevelBlock(node, context));
    return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] };
}

function collectDefinitions(tree: Root): Map<string, Definition> {
    const definitions = new Map<string, Definition>();
    visit(tree);
    return definitions;

    function visit(node: Nodes) {
        if (node.type === 'definition' && !definitions.has(node.identifier)) {
            definitions.set(node.identifier, node);
        }
        if ('children' in node) {
            for (const child of node.children) {
                visit(child);
            }
        }
    }
}

function readTopLevelBlock(node: RootContent, context: ReadContext): JSONContent {
    try {
        const json = readBlock(node, context);
        schema.nodeFromJSON(json).check();
        return json;
    } catch {
        // Whatever fails to map or to validate — an unknown construct, a shape the schema rejects — is kept as its
        // source: losing what the agent wrote is worse than showing it raw.
        return { type: 'markdownRaw', attrs: { source: sliceSource(node, context.source) } };
    }
}

function readBlock(node: RootContent, context: ReadContext): JSONContent {
    switch (node.type) {
        case 'paragraph':
            return withContent({ type: 'paragraph' }, readInlines(node.children, context, []));
        case 'heading':
            return withContent(
                { type: 'heading', attrs: { level: node.depth } },
                readInlines(node.children, context, []),
            );
        case 'thematicBreak':
            return { type: 'horizontalRule' };
        case 'code':
            // The info string after the language (```js title="x") has nowhere to live in the editor.
            if (node.meta != null) {
                throw new UnmappableError();
            }
            return withContent({ type: 'codeBlock', attrs: { language: node.lang ?? null } }, textContent(node.value));
        case 'blockquote': {
            const nested = { ...context, nested: true };
            return withContent(
                { type: 'blockquote' },
                node.children.map(child => readBlock(child, nested)),
            );
        }
        case 'list':
            return readList(node.ordered === true, node.start, node.children, context);
        case 'table':
            return readTable(node, context);
        default:
            throw new UnmappableError();
    }
}

function readList(
    ordered: boolean,
    start: number | null | undefined,
    items: ListItem[],
    context: ReadContext,
): JSONContent {
    const nested = { ...context, nested: true };
    const tasks = items.filter(item => item.checked != null).length;
    if (tasks > 0) {
        // The editor's task list is unordered and holds task items only.
        if (ordered || tasks !== items.length) {
            throw new UnmappableError();
        }
        return {
            type: 'taskList',
            content: items.map(item =>
                withContent({ type: 'taskItem', attrs: { checked: item.checked === true } }, readItem(item)),
            ),
        };
    }

    return {
        type: ordered ? 'orderedList' : 'bulletList',
        ...(ordered ? { attrs: { start: start ?? 1 } } : {}),
        content: items.map(item => withContent({ type: 'listItem' }, readItem(item))),
    };

    function readItem(item: ListItem) {
        return item.children.map(child => readBlock(child, nested));
    }
}

function readTable(node: MdastTable, context: ReadContext): JSONContent {
    const width = node.children[0]?.children.length ?? 0;
    const cellContext = { ...context, inCell: true };
    return {
        type: 'table',
        content: node.children.map((row, rowIndex) => {
            // A cell past the header's width has no column in the editor's table.
            if (row.children.length > width) {
                throw new UnmappableError();
            }
            const type = rowIndex === 0 ? 'tableHeader' : 'tableCell';
            const content: JSONContent[] = [];
            for (let column = 0; column < width; column++) {
                const cell = row.children[column];
                content.push({
                    type,
                    attrs: { align: node.align?.[column] ?? null },
                    content: [
                        withContent({ type: 'paragraph' }, cell ? readInlines(cell.children, cellContext, []) : []),
                    ],
                });
            }
            return { type: 'tableRow', content };
        }),
    };
}

function readInlines(nodes: PhrasingContent[], context: ReadContext, marks: EditorMark[]): JSONContent[] {
    const content: JSONContent[] = [];
    for (const node of nodes) {
        content.push(...readInline(node, context, marks));
    }
    return content;
}

function readInline(node: PhrasingContent, context: ReadContext, marks: EditorMark[]): JSONContent[] {
    switch (node.type) {
        case 'text':
            return textContent(node.value, marks);
        case 'emphasis':
            return readInlines(node.children, context, [...marks, { type: 'italic' }]);
        case 'strong':
            return readInlines(node.children, context, [...marks, { type: 'bold' }]);
        case 'delete':
            return readInlines(node.children, context, [...marks, { type: 'strike' }]);
        case 'inlineCode':
            return node.value === ''
                ? [readRawInline(node, context, marks)]
                : textContent(node.value, [...marks, { type: 'code' }]);
        case 'break':
            return [withMarks({ type: 'hardBreak' }, marks)];
        case 'link':
            return readLink(node, node.url, node.title, context, marks);
        case 'linkReference': {
            const definition = context.definitions.get(node.identifier);
            return definition
                ? readLink(node, definition.url, definition.title, context, marks)
                : [readRawInline(node, context, marks)];
        }
        case 'html':
            return context.inCell && node.value === CELL_BREAK
                ? [withMarks({ type: 'hardBreak' }, marks)]
                : [readRawInline(node, context, marks)];
        default:
            return [readRawInline(node, context, marks)];
    }
}

function readLink(
    node: Link | LinkReference,
    href: string,
    title: string | null | undefined,
    context: ReadContext,
    marks: EditorMark[],
): JSONContent[] {
    const content = readInlines(node.children, context, [
        ...marks,
        { type: 'link', attrs: { href, title: title ?? null } },
    ]);
    // A link with no text (`[](url)`) would vanish as a mark on nothing.
    return content.length > 0 ? content : [readRawInline(node, context, marks)];
}

function readRawInline(node: PhrasingContent, context: ReadContext, marks: EditorMark[]): JSONContent {
    const source = sliceSource(node, context.source);
    // Lines after the first carry the list's or quote's indentation, which writing would add again.
    if (context.nested && source.includes('\n')) {
        throw new UnmappableError();
    }
    return withMarks({ type: 'markdownRawInline', attrs: { source } }, marks);
}

function sliceSource(node: RootContent, source: string): string {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    assert(start != null && end != null, `Markdown node "${node.type}" has no position`);
    return source.slice(start, end);
}

function textContent(text: string, marks: EditorMark[] = []): JSONContent[] {
    return text === '' ? [] : [withMarks({ type: 'text', text }, marks)];
}

function withContent(node: JSONContent, content: JSONContent[]): JSONContent {
    return content.length > 0 ? { ...node, content } : node;
}

function withMarks(node: JSONContent, marks: EditorMark[]): JSONContent {
    return marks.length > 0 ? { ...node, marks } : node;
}

function writeBlocks(nodes: JSONContent[]): BlockContent[] {
    const blocks: BlockContent[] = [];
    for (const node of nodes) {
        const block = writeBlock(node);
        if (block) {
            blocks.push(block);
        }
    }
    return blocks;
}

/** Writes one editor block; an empty paragraph, which Markdown cannot hold, writes nothing. */
function writeBlock(node: JSONContent): BlockContent | undefined {
    switch (node.type) {
        case 'paragraph': {
            const children = writeInlines(node.content ?? [], false);
            return children.length > 0 ? { type: 'paragraph', children } : undefined;
        }
        case 'heading':
            return {
                type: 'heading',
                depth: readHeadingDepth(node),
                children: writeInlines(node.content ?? [], false),
            };
        case 'horizontalRule':
            return { type: 'thematicBreak' };
        case 'codeBlock':
            return {
                type: 'code',
                lang: readStringAttr(node, 'language'),
                meta: null,
                value: (node.content ?? []).map(child => child.text ?? '').join(''),
            };
        case 'blockquote':
            return { type: 'blockquote', children: writeBlocks(node.content ?? []) };
        case 'bulletList':
        case 'orderedList':
        case 'taskList':
            return {
                type: 'list',
                ordered: node.type === 'orderedList',
                start: node.type === 'orderedList' ? (readNumberAttr(node, 'start') ?? 1) : null,
                spread: false,
                children: (node.content ?? []).map(writeListItem),
            };
        case 'table':
            return writeTable(node);
        case 'markdownRaw':
            return { type: 'html', value: readStringAttr(node, 'source') ?? '' };
        default:
            throw new Error(`The editor node "${node.type}" has no Markdown form`);
    }
}

function writeListItem(node: JSONContent): ListItem {
    const children = writeBlocks(node.content ?? []);
    return {
        type: 'listItem',
        // Without a blank line, a paragraph after the first would run into it; a nested list needs none.
        spread: children.some((child, index) => index > 0 && child.type !== 'list'),
        checked: node.type === 'taskItem' ? node.attrs?.['checked'] === true : null,
        children,
    };
}

function writeTable(node: JSONContent): MdastTable {
    const rows = node.content ?? [];
    return {
        type: 'table',
        // Markdown aligns columns, not cells: the header row's cells carry the column's alignment.
        align: (rows[0]?.content ?? []).map(readAlign),
        children: rows.map((row): MdastTableRow => ({
            type: 'tableRow',
            children: (row.content ?? []).map(writeTableCell),
        })),
    };
}

function writeTableCell(cell: JSONContent): MdastTableCell {
    const children: PhrasingContent[] = [];
    for (const [index, paragraph] of (cell.content ?? []).entries()) {
        if (index > 0) {
            children.push({ type: 'html', value: CELL_BREAK });
        }
        children.push(...writeInlines(paragraph.content ?? [], true));
    }
    return { type: 'tableCell', children };
}

function writeInlines(nodes: JSONContent[], inCell: boolean): PhrasingContent[] {
    const items = nodes.map((node): InlineItem => ({
        node,
        marks: (node.marks ?? []).filter(mark => mark.type !== 'code'),
        code: (node.marks ?? []).some(mark => mark.type === 'code'),
    }));
    return writeMarkedRange(items, inCell);
}

/**
 * Turns flat marked nodes into nested mdast: at each node, the mark running longest from there becomes the outer
 * container, so `**a *b* c**` stays one strong around an emphasis.
 */
function writeMarkedRange(items: InlineItem[], inCell: boolean): PhrasingContent[] {
    const result: PhrasingContent[] = [];
    let index = 0;
    while (index < items.length) {
        const item = items[index];
        assert(item);
        if (item.marks.length === 0) {
            result.push(writeInlineLeaf(item, inCell));
            index++;
            continue;
        }

        let outer = item.marks[0];
        let outerRun = 0;
        for (const mark of item.marks) {
            const run = measureRun(items, index, mark);
            if (run > outerRun) {
                outer = mark;
                outerRun = run;
            }
        }
        assert(outer);
        const mark = outer;
        const inner = items.slice(index, index + outerRun).map((runItem): InlineItem => ({
            ...runItem,
            marks: runItem.marks.filter(other => !isSameMark(other, mark)),
        }));
        result.push(writeMarkContainer(mark, writeMarkedRange(inner, inCell)));
        index += outerRun;
    }
    return result;
}

function measureRun(items: InlineItem[], from: number, mark: EditorMark): number {
    let run = 0;
    while (items[from + run]?.marks.some(other => isSameMark(other, mark))) {
        run++;
    }
    return run;
}

function isSameMark(a: EditorMark, b: EditorMark): boolean {
    return (
        a.type === b.type &&
        readStringAttr(a, 'href') === readStringAttr(b, 'href') &&
        readStringAttr(a, 'title') === readStringAttr(b, 'title')
    );
}

function writeMarkContainer(mark: EditorMark, children: PhrasingContent[]): PhrasingContent {
    switch (mark.type) {
        case 'bold':
            return { type: 'strong', children };
        case 'italic':
            return { type: 'emphasis', children };
        case 'strike':
            return { type: 'delete', children };
        case 'link':
            return {
                type: 'link',
                url: readStringAttr(mark, 'href') ?? '',
                title: readStringAttr(mark, 'title'),
                children,
            };
        default:
            throw new Error(`The editor mark "${mark.type}" has no Markdown form`);
    }
}

function writeInlineLeaf(item: InlineItem, inCell: boolean): PhrasingContent {
    switch (item.node.type) {
        case 'text': {
            const value = item.node.text ?? '';
            return item.code ? { type: 'inlineCode', value } : { type: 'text', value };
        }
        case 'hardBreak':
            // A Markdown table row is one line: `<br>` is GitHub's line break inside a cell.
            return inCell ? { type: 'html', value: CELL_BREAK } : { type: 'break' };
        case 'markdownRawInline':
            return { type: 'html', value: readStringAttr(item.node, 'source') ?? '' };
        default:
            throw new Error(`The editor node "${item.node.type}" has no Markdown form`);
    }
}

function readHeadingDepth(node: JSONContent): 1 | 2 | 3 | 4 | 5 | 6 {
    const level = readNumberAttr(node, 'level');
    switch (level) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
            return level;
        default:
            return 1;
    }
}

function readAlign(cell: JSONContent): AlignType {
    const align = readStringAttr(cell, 'align');
    switch (align) {
        case 'left':
        case 'right':
        case 'center':
            return align;
        default:
            return null;
    }
}

function readStringAttr(node: Attributed, name: string): string | null {
    const value = node.attrs?.[name];
    return typeof value === 'string' ? value : null;
}

function readNumberAttr(node: Attributed, name: string): number | null {
    const value = node.attrs?.[name];
    return typeof value === 'number' ? value : null;
}
