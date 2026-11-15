import { expect, test } from 'bun:test';

import { parseCsv } from './parseCsv.js';

test('splits rows on any line break, without an empty row for the last one', () => {
    expect(parseCsv('date,steps\r\n2026-11-01,8200\n2026-11-02,10400\r2026-11-03,\n')).toEqual([
        ['date', 'steps'],
        ['2026-11-01', '8200'],
        ['2026-11-02', '10400'],
        ['2026-11-03', ''],
    ]);
});

test('a quoted field holds commas, line breaks and doubled quotes', () => {
    expect(parseCsv('name,note\n"Kowalski, Jan","Said ""hi""\nand left"\n""\n')).toEqual([
        ['name', 'note'],
        ['Kowalski, Jan', 'Said "hi"\nand left'],
        [''],
    ]);
});

test('keeps blank lines, ragged rows and a stray quote as they are, and drops a byte order mark', () => {
    expect(parseCsv('﻿a,b,c\n\n1\n5" screen,"x"y')).toEqual([['a', 'b', 'c'], [''], ['1'], ['5" screen', 'xy']]);
});

test('an empty file has no rows', () => {
    expect(parseCsv('')).toEqual([]);
});
