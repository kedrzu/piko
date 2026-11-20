# The Markdown editor reads and writes through our own mdast bridge

## Status

Accepted

## Context

Files open in a rich editor that writes plain Markdown underneath ([D33](../design/piko/DECISIONS.md#d33)).
The agent writes arbitrary Markdown, and D33 left unchecked how faithfully Tiptap round-trips it. The
editor must never lose or change what the agent wrote: an untouched file must not be rewritten, and an
edited one must keep the meaning of everything the person did not touch.

> **Checked 2026-11-14** (Tiptap 3.34.0, an Editor with StarterKit, `@tiptap/markdown`, TableKit,
> TaskList/TaskItem and Image, Markdown in, `getMarkdown()` out): `@tiptap/markdown` corrupts files.
>
> - `\# not heading` → `# not heading`; `1\. not list` and `\- not item` likewise. On the next read
>   the text becomes a heading or a list.
> - Front matter `---\ntitle: X\ntags: [a, b]\n---` → `---\n\n## title: X\ntags: \[a, b\]`.
> - HTML: `Text <span>inline</span>` → `Text inline`; the tags of a `<details>` block disappear.
> - Footnotes: `Text[^1]\n\n[^1]: Note.` → `Text[^1](Note.)`.
> - Headings, emphasis, code, links, nested and task lists, quotes, code blocks, rules, hard breaks
>   and ordered-list starts survive.
>
> The same inputs through `mdast-util-from-markdown` and `mdast-util-to-markdown` (GFM and front
> matter) keep their meaning: front matter byte for byte, `\#` still escaped. Only the spelling of
> some constructs changes.

## Options Considered

- **`@tiptap/markdown`, with patches.** Less code. Its escaping and HTML bugs are inside its serializer,
  so the patches would be fragile, and the risk of silently corrupting a file would remain.
- **Our own bridge: Markdown → mdast → Tiptap JSON, and back.** About 600 lines plus tests. It reuses
  the mdast parser `RichText` already depends on, and it can keep, verbatim, what the editor cannot
  show.

## Decision

We use our own bridge (`packages/ui/src/utils/markdownDocument.ts`), chosen by the owner on
2026-11-14. It works like this:

- **Front matter never enters the editor.** It is cut from the original string, together with the
  blank lines after it, and written back byte for byte.
- **What the editor has no node for is kept verbatim.** HTML blocks, footnote definitions and link
  definitions become a `markdownRaw` block. Inline HTML, footnote references and images become a
  `markdownRawInline` atom. Both are non-editable chips showing their source, and both are written
  back as that source.
- **Shapes the editor schema rejects fall back to raw.** That covers a list item that does not start
  with a paragraph, a list mixing task and plain items, a code block with more than a language in its
  info string, and an unmapped block nested in a list or quote. The whole top-level block becomes one
  raw block. Parsing never throws.
- **Line endings** (`\n` or `\r\n`) are detected on read and re-applied on write.
- **No rewrite on open.** `MarkdownEditor` emits Markdown only after an edit by the person.
- **Every link keeps its `href`,** whatever its scheme. Only clicking, inserting and autolinking are
  limited to web and mail addresses.

### What does not round-trip exactly

Each item below is a `normalised:` case in `markdownDocument.test.ts`. In every case the meaning is
kept: the re-parsed mdast is equal to the original after normalising.

- Bullets `*` and `+` become `-`. `_em_` becomes `*em*`, `__strong__` becomes `**strong**`, and `~del~`
  becomes `~~del~~`.
- Setext headings become ATX headings. The rules `***` and `___` become `---`.
- Indented and tilde code blocks become backtick fences.
- A two-space hard break becomes `\`.
- Loose lists become tight. An item with several blocks keeps its blank lines.
- `1. 1.` is renumbered to `1. 2.`. The `)` delimiter becomes `.`, except next to another list, where
  the delimiter alternates.
- Reference links `[x][ref]` become inline links `[x](url)`. The definition stays as a raw block.
  Consecutive definitions get a blank line between them.
- A bare URL becomes `<url>`.
- Entities and escapes that change nothing become plain characters: `&amp;` → `&`, `foo\_bar` →
  `foo_bar`.
- Table padding is rewritten, and a short row is padded with empty cells. A hard break in a cell is
  written as `<br>`, and `<br>` in a cell reads back as a hard break.
- A missing final newline is added, and empty paragraphs are dropped.

## Consequences

- D33's unchecked question is answered: nothing the agent writes is lost or changes meaning. A
  rewritten file can differ in spelling only, and only after the person has edited it.
- Constructs kept as raw chips cannot be edited as formatted text. The person can still edit them in
  the syntax view.
- The bridge is ours to maintain. A new Markdown construct the editor should support needs a mapping
  both ways and a corpus case.
