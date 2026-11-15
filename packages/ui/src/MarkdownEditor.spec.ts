import { composeStories } from '@storybook/vue3-vite';
import { assert, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { AGENT_MARKDOWN, MEMORY_NOTE_MARKDOWN, POST_IDEAS_MARKDOWN } from './MarkdownEditor.fixtures.js';
import * as stories from './MarkdownEditor.stories.jsx';
import type { MarkdownEditorStoryFile } from './MarkdownEditor.stories.jsx';

const { MemoryNote, PostIdeas, AgentFile, SyntaxView, ReadOnly } = composeStories(stories);

test('typing writes Markdown with the front matter kept, and the parent passing it back leaves the caret in place', async () => {
    const update = vi.fn<(markdown: string) => void>();
    await MemoryNote.run({ args: { ...MemoryNote.args, 'onUpdate:markdown': update } });

    await userEvent.click(page.getByRole('heading', { name: 'Czego szukam' }));
    // Each character is reported and passed back by the story's parent before the next one is typed.
    await userEvent.keyboard('{End} teraz');

    expect(update).toHaveBeenCalledTimes(' teraz'.length);
    expect(update).toHaveBeenLastCalledWith(MEMORY_NOTE_MARKDOWN.replace('## Czego szukam', '## Czego szukam teraz'));
});

test('nothing is reported without an edit: not on load, a click into a list or a table, arrow keys or a view switch', async () => {
    const update = vi.fn<(markdown: string) => void>();
    await AgentFile.run({ args: { ...AgentFile.args, 'onUpdate:markdown': update } });

    await userEvent.click(page.getByText('półka w łazience'));
    await userEvent.click(page.getByRole('cell', { name: 'Karuzela' }));
    await userEvent.keyboard('{ArrowRight}{ArrowDown}{ArrowLeft}{ArrowUp}');
    const syntax = page.getByRole('button', { name: 'Show Markdown syntax' });
    await userEvent.click(syntax);
    await expect.element(page.getByRole('textbox', { name: 'Markdown source' })).toHaveValue(AGENT_MARKDOWN);
    await userEvent.click(syntax);
    await expect.element(page.getByRole('textbox', { name: 'File content' })).toBeVisible();

    expect(update).not.toHaveBeenCalled();
});

test('a file the agent rewrote replaces the content without being reported, and the next edit builds on it', async () => {
    const update = vi.fn<(markdown: string) => void>();
    let file: MarkdownEditorStoryFile | undefined;
    await PostIdeas.run({
        args: { ...PostIdeas.args, 'onUpdate:markdown': update, onOpen: opened => (file = opened) },
    });
    assert(file);

    const rewritten = `${POST_IDEAS_MARKDOWN}\n## Pięć kroków na mróz\n\nKaruzela z listą.\n`;
    file.rewrite(rewritten);
    await expect.element(page.getByRole('heading', { name: 'Pięć kroków na mróz' })).toBeVisible();
    expect(update).not.toHaveBeenCalled();

    await userEvent.click(page.getByText('Karuzela z listą.'));
    await userEvent.keyboard('{End} Gotowe');
    expect(update).toHaveBeenLastCalledWith(rewritten.replace('Karuzela z listą.', 'Karuzela z listą. Gotowe'));
});

test('what the editor cannot show formatted stays visible as its source and survives an edit elsewhere', async () => {
    const update = vi.fn<(markdown: string) => void>();
    await AgentFile.run({ args: { ...AgentFile.args, 'onUpdate:markdown': update } });

    await expect
        .element(page.getByText('<div align="center">Nie zmieniaj tego bloku — to układ okładki.</div>'))
        .toBeVisible();
    await expect.element(page.getByText('![Szkic okładki](cover-draft-3.png)')).toBeVisible();
    await expect.element(page.getByText('[^1]: Wersja trzecia, po uwagach z poprzedniego tygodnia.')).toBeVisible();

    await userEvent.click(page.getByRole('heading', { name: 'Plan na grudzień' }));
    await userEvent.keyboard('{End}!');

    // A reference link is written back inline, its definition kept; everything else is the file as the agent wrote it.
    expect(update).toHaveBeenLastCalledWith(
        AGENT_MARKDOWN.replace('# Plan na grudzień', '# Plan na grudzień!').replace(
            '[profilu][profil]',
            '[profilu](https://instagram.com/example)',
        ),
    );
});

test('the syntax view shows the Markdown, and what is written there reaches the formatted view', async () => {
    const update = vi.fn<(markdown: string) => void>();
    await SyntaxView.run({ args: { ...SyntaxView.args, 'onUpdate:markdown': update } });

    const source = page.getByRole('textbox', { name: 'Markdown source' });
    await expect.element(source).toHaveValue(MEMORY_NOTE_MARKDOWN);
    const edited = MEMORY_NOTE_MARKDOWN.replace('## Aplikacje', '## Wysłane aplikacje');
    await userEvent.fill(source, edited);
    expect(update).toHaveBeenLastCalledWith(edited);

    await userEvent.click(page.getByRole('button', { name: 'Show Markdown syntax' }));
    await expect.element(page.getByRole('heading', { name: 'Wysłane aplikacje' })).toBeVisible();
    await expect.element(page.getByRole('heading', { name: 'Aplikacje', exact: true })).not.toBeInTheDocument();
});

test('the link dialog takes only a web or mail address, and a pasted script link or image does not get in', async () => {
    const update = vi.fn<(markdown: string) => void>();
    await PostIdeas.run({ args: { ...PostIdeas.args, 'onUpdate:markdown': update } });

    await userEvent.click(page.getByText('Krótka rolka.', { exact: false }));
    await userEvent.keyboard('{End} ');
    const typed = update.mock.calls.length;

    await userEvent.click(page.getByRole('button', { name: 'Link' }));
    const address = page.getByRole('textbox', { name: 'Address' });
    await userEvent.fill(address, 'javascript:alert(1)');
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect.element(page.getByRole('alert')).toBeVisible();
    expect(update).toHaveBeenCalledTimes(typed);

    await userEvent.fill(address, 'https://example.com/uva');
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    const linked = 'Krótka rolka. Odpowiedź: tak, promienie UVA przechodzą przez chmury. <https://example.com/uva>';
    expect(update).toHaveBeenLastCalledWith(
        POST_IDEAS_MARKDOWN.replace('Krótka rolka. Odpowiedź: tak, promienie UVA przechodzą przez chmury.', linked),
    );

    const editor = page.getByRole('textbox', { name: 'Pomysły na posty' }).element();
    const clipboard = new DataTransfer();
    clipboard.setData(
        'text/html',
        '<p>Zobacz <a href="javascript:alert(1)">poradnik</a> <img src="x" onerror="window.__injected = true"></p>',
    );
    clipboard.setData('text/plain', 'Zobacz poradnik');
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));

    const pasted = update.mock.lastCall?.[0];
    expect(pasted).toContain(`${linked}Zobacz poradnik`);
    expect(pasted).not.toContain('javascript:');
    expect(pasted).not.toMatch(/<img|!\[/);
});

test('a read-only file takes no typing in either view and offers no formatting, and reports nothing', async () => {
    const update = vi.fn<(markdown: string) => void>();
    await ReadOnly.run({ args: { ...ReadOnly.args, 'onUpdate:markdown': update } });

    const editor = page.getByRole('textbox', { name: 'Pomysły na posty' });
    await expect.element(editor).toHaveAttribute('aria-readonly', 'true');
    await userEvent.click(page.getByText('Krótka rolka.', { exact: false }));
    await userEvent.keyboard('{End} dopisane');
    await expect.element(page.getByRole('button', { name: 'Bold' })).toBeDisabled();
    await expect.element(page.getByRole('button', { name: 'Link' })).toBeDisabled();

    await userEvent.click(page.getByRole('button', { name: 'Show Markdown syntax' }));
    const source = page.getByRole('textbox', { name: 'Markdown source' });
    await userEvent.type(source, ' dopisane');
    await expect.element(source).toHaveValue(POST_IDEAS_MARKDOWN);

    expect(update).not.toHaveBeenCalled();
});
