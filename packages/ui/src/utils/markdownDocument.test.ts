import { expect, test } from 'bun:test';

import { getSchema } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import type { Definition, Nodes, Root, TableCell } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { frontmatter } from 'micromark-extension-frontmatter';
import { gfm } from 'micromark-extension-gfm';

import { MarkdownEditorExtensions, parseMarkdown, serializeMarkdown } from './markdownDocument.js';

/** A Markdown file as the agent writes it, and what the editor writes back unedited. */
interface CorpusCase {
    name: string;
    markdown: string;
    /** The written form when the input is not already canonical; absent, the output must equal the input. */
    normalised?: string;
}

const schema = getSchema(MarkdownEditorExtensions);

/**
 * What the agent writes, and every way the bridge rewrites it. Each `normalised` is a documented difference: the
 * meaning (the mdast after `normaliseMdast`) is the same, only the spelling changes.
 */
const CORPUS: CorpusCase[] = [
    {
        name: 'memory note with front matter, nested lists, quote and links',
        markdown: [
            '---',
            'title: Weekly report',
            'updated: 2026-11-10',
            'tags: [reports, clients]',
            '---',
            '',
            '# Weekly report',
            '',
            'The client wants the report **every Monday** before *10:00*.',
            '',
            '## Steps',
            '',
            '1. Open the [dashboard](https://example.com/dash "Dashboard").',
            '2. Export the numbers as `CSV`.',
            '3. Summarise them:',
            '   - revenue',
            '   - new clients',
            '     - from ads',
            '     - from referrals',
            '',
            '> Remember: never send drafts.',
            '',
            '---',
            '',
            'See also [the routine](routines/weekly.md) and [notes](#notes).',
            '',
        ].join('\n'),
    },
    {
        name: 'routine with a nested task list and an aligned table',
        markdown: [
            '# Morning routine',
            '',
            '- [x] Check email',
            '- [ ] Review the calendar',
            '  - [ ] Move conflicts',
            '',
            '| Day     |   Task   | Minutes |',
            '| :------ | :------: | ------: |',
            '| Monday  | Invoices |      30 |',
            '| Tuesday | ~~None~~ |       0 |',
            '',
        ].join('\n'),
    },
    {
        name: 'escapes that would otherwise become structure',
        markdown: '\\# not heading\n\n1\\. not list\n\n\\- not bullet\n\n\\*not emphasis\\*\n',
    },
    {
        name: 'normalised: an escape that changes nothing is dropped',
        markdown: 'a \\| pipe outside a table\n',
        normalised: 'a | pipe outside a table\n',
    },
    {
        name: 'ordered list keeping its start, and a list item with two paragraphs',
        markdown: '3. third\n4. fourth\n\n- first\n\n  still first\n- second\n',
    },
    {
        name: 'inline code inside a link and strong, and nested emphasis',
        markdown: '[`file.ts`](src/file.ts) and **bold `code`** and **bold *both* bold** and ~~gone~~\n',
    },
    {
        name: 'links of every scheme keep their href',
        markdown:
            '[web](https://example.com) [file](other.md) [anchor](#anchor) [mail](mailto:a@b.co) [app](app://x/y) [script](javascript:void\\(0\\))\n',
    },
    {
        name: 'fenced code with and without a language, and a hard break',
        markdown: '```ts\nconst a = 1;\n```\n\n```\nplain\n```\n\nline one\\\nline two\n',
    },
    {
        name: 'HTML blocks and inline HTML stay verbatim',
        markdown: '<details>\n<summary>More</summary>\n\nHidden.\n\n</details>\n\nText with <kbd>Ctrl</kbd> inside.\n',
    },
    {
        name: 'footnotes stay verbatim',
        markdown:
            'A claim[^1] and another[^note].\n\n[^1]: The source.\n\n[^note]: A longer note\n    over two lines.\n',
    },
    {
        name: 'images and an image inside a link stay verbatim',
        markdown:
            '![Chart](chart.png "Q3") and [![Badge](badge.svg)](https://ci.example.com) and ![ref][logo]\n\n[logo]: logo.png\n',
    },
    {
        name: 'a table cell with a line break',
        markdown: '| Step | Notes |\n| ---- | ----- |\n| 1    | first<br>second |\n',
        normalised: '| Step | Notes           |\n| ---- | --------------- |\n| 1    | first<br>second |\n',
    },
    {
        name: 'code block whose info string has more than a language stays verbatim',
        markdown: '```js title="a.js"\nrun();\n```\n',
    },
    {
        name: 'schema-rejected list shapes stay verbatim',
        markdown: [
            '- [ ] a task',
            '- a plain item',
            '',
            'Between.',
            '',
            '1. [x] an ordered task',
            '',
            'Between.',
            '',
            '- ```',
            '  code first',
            '  ```',
            '',
            'Between.',
            '',
            '> <div>html in a quote</div>',
            '',
            '| a |',
            '| - |',
            '| 1 | extra |',
            '',
        ].join('\n'),
    },
    {
        name: 'normalised: bullet and emphasis markers',
        markdown: '* one\n+ two\n\n_em_ and __strong__ and ~del~\n',
        normalised: '- one\n\n* two\n\n*em* and **strong** and ~~del~~\n',
    },
    {
        name: 'normalised: setext heading and rule markers',
        markdown: 'Title\n=====\n\nSub\n---\n\n***\n\n___\n',
        normalised: '# Title\n\n## Sub\n\n---\n\n---\n',
    },
    {
        name: 'normalised: indented and tilde code become backtick fences',
        markdown: '    indented\n\n~~~py\nx = 1\n~~~\n',
        normalised: '```\nindented\n```\n\n```py\nx = 1\n```\n',
    },
    {
        name: 'normalised: trailing-space hard break becomes a backslash',
        markdown: 'line one  \nline two\n',
        normalised: 'line one\\\nline two\n',
    },
    {
        name: 'normalised: loose list becomes tight',
        markdown: '- a\n\n- b\n',
        normalised: '- a\n- b\n',
    },
    {
        name: 'normalised: ordered list numbers and delimiter',
        markdown: '1. a\n1. b\n\n5) c\n',
        // The second list keeps `)`: two adjacent lists with the same delimiter would merge into one.
        normalised: '1. a\n2. b\n\n5) c\n',
    },
    {
        name: 'normalised: reference links become inline links, the definition stays',
        markdown:
            '[full][site], [collapsed][], [shortcut].\n\n[site]: https://example.com "Site"\n[collapsed]: a.md\n[shortcut]: #s\n',
        normalised:
            '[full](https://example.com "Site"), [collapsed](a.md), [shortcut](#s).\n\n[site]: https://example.com "Site"\n\n[collapsed]: a.md\n\n[shortcut]: #s\n',
    },
    {
        name: 'normalised: bare URL becomes an autolink',
        markdown: 'Visit https://example.com today.\n',
        normalised: 'Visit <https://example.com> today.\n',
    },
    {
        name: 'normalised: entities and needless escapes become characters',
        markdown: '&amp; &copy; foo\\_bar\n',
        normalised: '& © foo_bar\n',
    },
    {
        name: 'normalised: a short table row is padded and cells are aligned',
        markdown: '| a | b |\n|:-|-:|\n| 1 |\n',
        normalised: '| a  |  b |\n| :- | -: |\n| 1  |    |\n',
    },
    {
        name: 'normalised: a missing final newline is added',
        markdown: 'no newline',
        normalised: 'no newline\n',
    },
];

for (const corpusCase of CORPUS) {
    test(`round-trips: ${corpusCase.name}`, () => {
        const parsed = parseMarkdown(corpusCase.markdown);
        const output = serializeMarkdown({ ...parsed, doc: throughEditor(parsed.doc) });

        expect(output).toBe(corpusCase.normalised ?? corpusCase.markdown);
        expect(normaliseMdast(readMdast(output))).toEqual(normaliseMdast(readMdast(corpusCase.markdown)));
        // Writing is stable: a second pass changes nothing.
        expect(serializeMarkdown(parseMarkdown(output))).toBe(output);
    });
}

test('front matter survives an edit byte for byte, with its separator, on LF and CRLF files', () => {
    const frontMatter = '---\ntitle: "Notes"   \nlist:\n  - a\n\n  - b\n---\n\n\n';
    for (const eol of ['\n', '\r\n']) {
        const file = (frontMatter + '# Notes\n\nFirst.\n').replaceAll('\n', eol);
        const parsed = parseMarkdown(file);
        const doc = parsed.doc;
        const edited = { ...doc, content: [...(doc.content ?? []), paragraph('Added.')] };

        const output = serializeMarkdown({ ...parsed, doc: throughEditor(edited) });

        expect(parsed.frontMatter).toBe(frontMatter.replaceAll('\n', eol));
        expect(output).toBe(`${frontMatter}# Notes\n\nFirst.\n\nAdded.\n`.replaceAll('\n', eol));
        expect(JSON.stringify(doc)).not.toContain('title');
    }
});

test('front matter with mixed line endings is kept exactly as the file has it', () => {
    const file = '---\r\na: 1\nb: 2\r\n---\n\r\nBody.\r\n';

    const parsed = parseMarkdown(file);

    expect(parsed.frontMatter).toBe('---\r\na: 1\nb: 2\r\n---\n\r\n');
    expect(serializeMarkdown(parsed)).toBe('---\r\na: 1\nb: 2\r\n---\n\r\nBody.\r\n');
});

test('a file that is only front matter writes back unchanged', () => {
    const file = '---\ntitle: Empty\n---\n';

    const parsed = parseMarkdown(file);

    expect(parsed.doc).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(serializeMarkdown({ ...parsed, doc: throughEditor(parsed.doc) })).toBe(file);
});

test('a CRLF body is written back with CRLF only', () => {
    const file = '# A\r\n\r\n- one\r\n- two\r\n\r\n```\r\ncode\r\nmore\r\n```\r\n';

    const output = serializeMarkdown(parseMarkdown(file));

    expect(output).toBe(file);
});

test('what the editor has no node for becomes raw atoms holding the exact source', () => {
    const markdown = [
        'Text[^1] with <b>html</b> and ![img](a.png).',
        '',
        '<div align="center">',
        '  centered',
        '</div>',
        '',
        '[^1]: The note.',
        '',
        '[ref]: https://example.com',
        '',
    ].join('\n');

    const { doc } = parseMarkdown(markdown);

    const expected: JSONContent[] = [
        {
            type: 'paragraph',
            content: [
                { type: 'text', text: 'Text' },
                { type: 'markdownRawInline', attrs: { source: '[^1]' } },
                { type: 'text', text: ' with ' },
                { type: 'markdownRawInline', attrs: { source: '<b>' } },
                { type: 'text', text: 'html' },
                { type: 'markdownRawInline', attrs: { source: '</b>' } },
                { type: 'text', text: ' and ' },
                { type: 'markdownRawInline', attrs: { source: '![img](a.png)' } },
                { type: 'text', text: '.' },
            ],
        },
        { type: 'markdownRaw', attrs: { source: '<div align="center">\n  centered\n</div>' } },
        { type: 'markdownRaw', attrs: { source: '[^1]: The note.' } },
        { type: 'markdownRaw', attrs: { source: '[ref]: https://example.com' } },
    ];
    expect(doc.content).toEqual(expected);
});

test('a block the schema rejects falls back to one raw block instead of throwing', () => {
    const cases = [
        '- [ ] task\n- plain',
        '1. [ ] ordered task',
        '- ```\n  code\n  ```',
        '-\n- empty first item',
        '>',
        '| a |\n| - |\n| 1 | 2 |',
        '- item\n\n  <div>\n  html\n  </div>',
        '> quote with ![multi\n> line](image.png)',
    ];
    for (const markdown of cases) {
        const parsed = parseMarkdown(`${markdown}\n`);

        expect(parsed.doc.content).toEqual([{ type: 'markdownRaw', attrs: { source: markdown } }]);
        expect(serializeMarkdown(parsed)).toBe(`${markdown}\n`);
    }
});

test('every link href stays in the editor document, whatever its scheme', () => {
    const hrefs = [
        'https://example.com',
        'other.md',
        '../up/notes.md',
        '#anchor',
        'mailto:a@b.co',
        'javascript:alert(1)',
    ];
    const markdown = hrefs.map((href, index) => `[link ${index}](<${href}>)`).join(' ');

    const doc = throughEditor(parseMarkdown(markdown).doc);

    const found = (doc.content?.[0]?.content ?? []).flatMap(node =>
        (node.marks ?? []).filter(mark => mark.type === 'link').map(mark => mark.attrs?.['href']),
    );
    expect(found).toEqual(hrefs);
    const reread = throughEditor(parseMarkdown(serializeMarkdown({ ...parseMarkdown(markdown), doc })).doc);
    expect(reread).toEqual(doc);
});

test('a hard break or a new paragraph made in a table cell is written as <br>', () => {
    const parsed = parseMarkdown('| a |\n| - |\n| x |\n');
    const doc: JSONContent = {
        type: 'doc',
        content: [
            {
                type: 'table',
                content: [
                    { type: 'tableRow', content: [{ type: 'tableHeader', content: [paragraph('a')] }] },
                    {
                        type: 'tableRow',
                        content: [
                            {
                                type: 'tableCell',
                                content: [
                                    { type: 'paragraph', content: [text('x'), { type: 'hardBreak' }, text('y')] },
                                    paragraph('z'),
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    };

    const output = serializeMarkdown({ ...parsed, doc: throughEditor(doc) });

    expect(output).toBe('| a           |\n| ----------- |\n| x<br>y<br>z |\n');
});

test('overlapping marks made in the editor are written so they read back the same', () => {
    const doc: JSONContent = {
        type: 'doc',
        content: [
            {
                type: 'paragraph',
                content: [
                    text('a', [{ type: 'bold' }]),
                    text('b', [{ type: 'bold' }, { type: 'italic' }]),
                    text('c', [{ type: 'italic' }]),
                    text(' '),
                    text('d', [{ type: 'link', attrs: { href: 'x.md' } }, { type: 'code' }]),
                    text('e', [{ type: 'link', attrs: { href: 'x.md' } }]),
                    text('f', [{ type: 'link', attrs: { href: 'y.md' } }]),
                    { type: 'hardBreak' },
                    text('g', [{ type: 'strike' }]),
                ],
            },
            { type: 'paragraph' },
            { type: 'heading', attrs: { level: 2 }, content: [text('H')] },
        ],
    };
    const before = throughEditor(doc);

    const output = serializeMarkdown({ frontMatter: undefined, eol: '\n', doc: before });

    // The empty paragraph has no Markdown form and is dropped.
    const expected = throughEditor({ ...doc, content: [doc.content?.[0] ?? {}, doc.content?.[2] ?? {}] });
    expect(throughEditor(parseMarkdown(output).doc)).toEqual(expected);
});

/** The document as the editor hands it back: through the schema, with every default attribute filled in. */
function throughEditor(doc: JSONContent): JSONContent {
    const node = schema.nodeFromJSON(doc);
    node.check();
    return node.toJSON() as JSONContent;
}

function readMdast(markdown: string): Root {
    return fromMarkdown(markdown, {
        extensions: [gfm(), frontmatter()],
        mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown()],
    });
}

/**
 * The meaning of a document, without what Markdown spells two ways: positions, list looseness (`spread`), reference
 * links (resolved to the link they stand for) and table rows shorter than the header (padded, as GFM renders them).
 */
function normaliseMdast(tree: Root): unknown {
    const definitions = new Map<string, Definition>();
    collect(tree);
    return normalise(tree);

    function collect(node: Nodes) {
        if (node.type === 'definition' && !definitions.has(node.identifier)) {
            definitions.set(node.identifier, node);
        }
        if ('children' in node) {
            for (const child of node.children) {
                collect(child);
            }
        }
    }

    function normalise(node: Nodes): unknown {
        if (node.type === 'linkReference') {
            const definition = definitions.get(node.identifier);
            expect(definition).toBeDefined();
            return normalise({
                type: 'link',
                url: definition!.url,
                title: definition!.title ?? null,
                children: node.children,
            });
        }

        let current = node;
        if (current.type === 'table') {
            const width = current.children[0]?.children.length ?? 0;
            current = {
                ...current,
                children: current.children.map(row => ({
                    ...row,
                    children: [
                        ...row.children,
                        ...Array.from({ length: Math.max(0, width - row.children.length) }, (): TableCell => ({
                            type: 'tableCell',
                            children: [],
                        })),
                    ],
                })),
            };
        }

        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(current)) {
            if (key !== 'position' && key !== 'spread' && key !== 'children') {
                result[key] = value;
            }
        }
        if ('children' in current) {
            result['children'] = current.children.map(normalise);
        }
        return result;
    }
}

function paragraph(value: string): JSONContent {
    return { type: 'paragraph', content: [text(value)] };
}

function text(value: string, marks?: JSONContent['marks']): JSONContent {
    return marks ? { type: 'text', text: value, marks } : { type: 'text', text: value };
}
