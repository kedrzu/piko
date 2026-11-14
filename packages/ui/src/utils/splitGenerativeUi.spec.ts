import { expect, test } from 'vitest';

import { splitGenerativeUi } from './splitGenerativeUi.js';

test('text without an openui block is one unchanged Markdown segment', () => {
    for (const text of ['', 'Cześć', 'a\n\n```js\nconst x = 1;\n```\n\nb', '```\n```openui\nx\n```']) {
        expect(splitGenerativeUi(text)).toEqual([{ type: 'markdown', text }]);
    }
});

test('splits text, block and text in order, with either info string and either fence', () => {
    expect(splitGenerativeUi('Przed\n\n```openui\nroot = Stack([])\n```\n\nPo')).toEqual([
        { type: 'markdown', text: 'Przed\n' },
        { type: 'ui', source: 'root = Stack([])', closed: true },
        { type: 'markdown', text: '\nPo' },
    ]);
    expect(splitGenerativeUi('~~~~openui-lang\na = 1\n~~~~~\n   ```openui\nb = 2\n   ```')).toEqual([
        { type: 'ui', source: 'a = 1', closed: true },
        { type: 'ui', source: 'b = 2', closed: true },
    ]);
});

test('an unclosed block takes the rest of the text and is not closed', () => {
    expect(splitGenerativeUi('Tekst\n```openui\nroot = Stack([a])\na = Te')).toEqual([
        { type: 'markdown', text: 'Tekst' },
        { type: 'ui', source: 'root = Stack([a])\na = Te', closed: false },
    ]);
});

test('a shorter or different fence does not close the block, and an openui fence inside another code block stays Markdown', () => {
    expect(splitGenerativeUi('````openui\na\n```\n~~~\nb')).toEqual([
        { type: 'ui', source: 'a\n```\n~~~\nb', closed: false },
    ]);
    const text = '~~~md\n```openui\na\n```\n~~~';
    expect(splitGenerativeUi(text)).toEqual([{ type: 'markdown', text }]);
});

test('a fence that is not at line start (4 spaces, or text before it) is no block', () => {
    for (const text of ['    ```openui\na\n```', 'tak: ```openui\na\n```', '```openui`\na\n```']) {
        expect(splitGenerativeUi(text)).toEqual([{ type: 'markdown', text }]);
    }
});
