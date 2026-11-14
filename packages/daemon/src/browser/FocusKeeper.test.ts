import { describe, expect, it } from 'bun:test';

import { chooseRestorePid, parseHelperLine } from './FocusKeeper.js';

describe('parseHelperLine', () => {
    it('reads an activation', () => {
        expect(parseHelperLine('activated 123 com.apple.Notes')).toEqual({ pid: 123, bundleId: 'com.apple.Notes' });
    });

    it('reads the ready line, which has the bundle id first', () => {
        expect(parseHelperLine('ready com.apple.finder 77\n')).toEqual({ pid: 77, bundleId: 'com.apple.finder' });
    });

    it.each(['', 'activate 5 gone', 'activated abc com.x', 'activated 0 com.x', 'activated 12', 'ready x'])(
        'ignores %p',
        line => {
            expect(parseHelperLine(line)).toBeNull();
        },
    );
});

describe('chooseRestorePid', () => {
    it('takes any app that is not the browser', () => {
        expect(chooseRestorePid(1, { pid: 2, bundleId: 'com.apple.Notes' })).toBe(2);
        expect(chooseRestorePid(null, { pid: 2, bundleId: 'com.apple.Notes' })).toBe(2);
    });

    it('keeps the previous app when the browser activates', () => {
        expect(chooseRestorePid(1, { pid: 9, bundleId: 'com.google.chrome.for.testing' })).toBe(1);
        expect(chooseRestorePid(null, { pid: 9, bundleId: 'com.google.chrome.for.testing' })).toBeNull();
    });
});
