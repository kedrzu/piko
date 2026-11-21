import { expect, test } from 'bun:test';

import { readStreamLines } from './readStreamLines.js';

test('calls back with whole lines across chunk boundaries and returns the whole text', async () => {
    const encoded = new TextEncoder().encode('pierwsza linia\nżółw\nostatnia');
    // Splits inside the first line and inside the two bytes of `ż`.
    const cut = encoded.indexOf(0xc5) + 1;
    const stream = new Blob([encoded.slice(0, 5), encoded.slice(5, cut), encoded.slice(cut)]).stream();
    const lines: string[] = [];

    const text = await readStreamLines(stream, line => lines.push(line));

    expect(lines).toEqual(['pierwsza linia', 'żółw', 'ostatnia']);
    expect(text).toBe('pierwsza linia\nżółw\nostatnia');
});
