import { expect, test } from 'bun:test';

import { mergeMarkdown } from './mergeMarkdown.js';

/** As the agent writes it: a starred list, which the editor writes back as a dashed one. */
const BASE = ['# Plan', '', '* walk', '* swim', '', 'Read daily.', ''].join('\n');

test("the editor's rewrite of the whole file is not taken as the person's change", () => {
    // The editor wrote the list with dashes on the person's first keystroke, in the last paragraph.
    const mine = ['# Plan', '', '- walk', '- swim', '', 'Read daily. Twice.', ''].join('\n');
    // The agent changed the list, still with stars.
    const theirs = ['# Plan', '', '* walk', '* swim', '* cycle', '', 'Read daily.', ''].join('\n');

    expect(mergeMarkdown({ base: BASE, mine, theirs })).toBe(
        ['# Plan', '', '- walk', '- swim', '- cycle', '', 'Read daily. Twice.', ''].join('\n'),
    );
});

test('different changes to the same paragraph are still a conflict', () => {
    const mine = ['# Plan', '', '- walk', '- swim', '', 'Read daily. Twice.', ''].join('\n');
    const theirs = ['# Plan', '', '* walk', '* swim', '', 'Read weekly.', ''].join('\n');

    expect(mergeMarkdown({ base: BASE, mine, theirs })).toBeNull();
});
