import { expect, test } from 'bun:test';

import { mergeText } from './mergeText.js';

const BASE = ['# Plan', '', 'Walk every morning.', '', 'Swim on Fridays.', ''].join('\n');

test('changes to different lines both survive', () => {
    const merged = mergeText({
        base: BASE,
        mine: BASE.replace('Walk every morning.', 'Walk every morning. Twice.'),
        theirs: BASE.replace('Swim on Fridays.', 'Swim on Saturdays.'),
    });

    expect(merged).toBe(['# Plan', '', 'Walk every morning. Twice.', '', 'Swim on Saturdays.', ''].join('\n'));
});

test('the same change made on both sides counts once', () => {
    const changed = BASE.replace('Swim on Fridays.', 'Swim on Saturdays.');

    expect(mergeText({ base: BASE, mine: changed, theirs: changed })).toBe(changed);
});

test('different changes to the same line are a conflict', () => {
    const merged = mergeText({
        base: BASE,
        mine: BASE.replace('Walk every morning.', 'Walk every morning. Twice.'),
        theirs: BASE.replace('Walk every morning.', 'Run on Sundays.'),
    });

    expect(merged).toBeNull();
});
