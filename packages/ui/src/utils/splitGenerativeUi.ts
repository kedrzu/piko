/** A run of an agent's text: Markdown to show as text, or the program of a generative UI block. */
export type GenerativeUiSegment =
    | { type: 'markdown'; text: string }
    /** `closed` is false while the block's closing fence has not arrived: `source` is then what is written so far. */
    | { type: 'ui'; source: string; closed: boolean };

interface Fence {
    char: string;
    length: number;
}

/**
 * Splits the agent's Markdown around its `openui` / `openui-lang` fenced blocks, in order. Fences follow CommonMark
 * (``` or ~~~, at line start, closed by at least as long a fence), so an `openui` block inside another code block
 * stays Markdown. Whitespace-only Markdown between blocks is dropped; text without a block is one unchanged segment.
 *
 * @util
 */
export function splitGenerativeUi(text: string): GenerativeUiSegment[] {
    const segments: GenerativeUiSegment[] = [];
    let markdown: string[] = [];
    let ui: string[] | null = null;
    let fence: Fence | null = null;

    for (const line of text.split('\n')) {
        if (fence == null) {
            const opened = readOpeningFence(line);
            if (opened == null) {
                markdown.push(line);
            } else if (opened.openui) {
                pushMarkdown(segments, markdown);
                markdown = [];
                ui = [];
                fence = opened.fence;
            } else {
                markdown.push(line);
                fence = opened.fence;
            }
        } else if (closesFence(line, fence)) {
            if (ui != null) {
                segments.push({ type: 'ui', source: ui.join('\n'), closed: true });
                ui = null;
            } else {
                markdown.push(line);
            }
            fence = null;
        } else if (ui != null) {
            ui.push(line);
        } else {
            markdown.push(line);
        }
    }

    if (ui != null) {
        segments.push({ type: 'ui', source: ui.join('\n'), closed: false });
    }
    if (segments.length === 0) {
        return [{ type: 'markdown', text }];
    }
    pushMarkdown(segments, markdown);
    return segments;
}

function pushMarkdown(segments: GenerativeUiSegment[], lines: string[]) {
    const markdown = lines.join('\n');
    if (markdown.trim() !== '') {
        segments.push({ type: 'markdown', text: markdown });
    }
}

function readOpeningFence(line: string) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    const marker = match?.[1];
    const info = match?.[2];
    if (marker == null || info == null || (marker.startsWith('`') && info.includes('`'))) {
        return null;
    }
    const language = info.trim().split(/\s+/)[0];
    return {
        fence: { char: marker.charAt(0), length: marker.length },
        openui: language === 'openui' || language === 'openui-lang',
    };
}

function closesFence(line: string, fence: Fence) {
    const marker = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)?.[1];
    return marker != null && marker.startsWith(fence.char) && marker.length >= fence.length;
}
