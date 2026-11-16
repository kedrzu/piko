import { expect, test } from 'bun:test';

import { LEAK_PAGES } from './leakPages.js';
import type { LeakReading } from './leakPages.js';

test('sannysoft fails on the rows whose result cell is marked failed, whatever other classes it has', () => {
    const rows = [
        { name: 'WebDriver', status: 'failed result' },
        { name: 'Chrome', status: 'result passed' },
        { name: 'Permissions', status: 'warn' },
        { name: 'PHANTOM_UA', status: 'passed' },
    ];

    const expected: LeakReading = { verdict: 'fail', failed: ['WebDriver'], details: { warnings: 'Permissions' } };
    expect(reduce('sannysoft', rows)).toEqual(expected);
});

test('rebrowser sorts its tests by icon, including the white circle with its variation selector', () => {
    const rows = [
        '⚪️ dummyFn',
        '🟢 sourceUrlLeak',
        '🔴 mainWorldExecution',
        '🟡 viewport',
        '🔴 useragent',
        '⚪ exposeFunctionLeak',
    ];

    const expected: LeakReading = {
        verdict: 'fail',
        failed: ['mainWorldExecution', 'useragent'],
        details: { warnings: 'viewport', notTriggered: 'dummyFn, exposeFunctionLeak' },
    };
    expect(reduce('rebrowser', rows)).toEqual(expected);
    expect(reduce('rebrowser', ['🟢 headless', '⚪️ dummyFn']).verdict).toBe('pass');
});

test('CreepJS fails on headless or stealth signals, not on like-headless ones', () => {
    const ratings = {
        'like-headless': { rating: '44% like headless:', signals: ['noChrome: false', 'noTaskbar: true'] },
        headless: { rating: '0% headless:', signals: ['webDriverIsOn: false'] },
        stealth: { rating: '0% stealth:', signals: ['hasIframeProxy: false'] },
    };

    const expected: LeakReading = {
        verdict: 'pass',
        failed: [],
        details: { likeHeadless: '44%', headless: '0%', stealth: '0%', likeHeadlessSignals: 'noTaskbar' },
    };
    expect(reduce('creepjs', ratings)).toEqual(expected);

    const headless = { ...ratings, headless: { rating: '33% headless:', signals: ['webDriverIsOn: true'] } };
    expect(reduce('creepjs', headless)).toMatchObject({ verdict: 'fail', failed: ['headless:webDriverIsOn'] });
});

test('BrowserScan fails on flagged summary categories and on checks reading Robot', () => {
    const reading = {
        verdict: 'Robot',
        summary: [
            { label: 'Webdriver', flagged: true },
            { label: 'User-Agent', flagged: true },
            { label: 'CDP', flagged: false },
        ],
        checks: [
            { name: 'WebDriver', result: 'Robot' },
            { name: 'Headless Chrome', result: 'Normal' },
        ],
    };

    const expected: LeakReading = {
        verdict: 'fail',
        failed: ['summary:Webdriver', 'summary:User-Agent', 'WebDriver'],
        details: { verdict: 'Robot' },
    };
    expect(reduce('browserscan', reading)).toEqual(expected);
});

test('a reading the page no longer produces in the expected shape throws instead of passing', () => {
    expect(() => reduce('botd', { result: { bot: 'no' }, detectors: {} })).toThrow('result.bot is not a boolean');
    expect(() => reduce('creepjs', { 'like-headless': { rating: 'n/a', signals: [] } })).toThrow('has no percentage');
});

function reduce(page: string, raw: unknown) {
    const leakPage = LEAK_PAGES.find(candidate => candidate.page === page);
    if (!leakPage) {
        throw new Error(`No leak page ${page}`);
    }
    return leakPage.reduce(raw);
}
