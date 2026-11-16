import { expect, test } from 'bun:test';

import { classifyPanelPage, filterVendorCookies } from './panel.js';
import type { PanelPageFacts, PanelPageState } from './panel.js';

test("a Cloudflare block page in the site's own design is told by its Ray ID", () => {
    const indeed = facts({
        title: 'Blocked - Indeed.com',
        textLength: 409,
        textStart:
            'Find jobs\nRequest Blocked\n\nYou have been blocked. …\n\nYour Ray ID for this request is a5b0bb64bed01c02',
    });

    expect(classifyPanelPage(indeed)).toEqual({ state: 'challenged', evidence: 'Cloudflare block page (Ray ID)' });
});

test('a DataDome iframe is a challenge even under a site expected behind another vendor', () => {
    const g2 = facts({
        title: 'g2.com',
        textLength: 0,
        iframes: ['https://geo.captcha-delivery.com/interstitial/?initialCid=abc&cid=visitor'],
        scripts: ['https://www.g2.com/cdn-cgi/challenge-platform/scripts/jsd/main.js'],
    });

    const expected: PanelPageState = {
        state: 'challenged',
        evidence: 'DataDome iframe geo.captcha-delivery.com/interstitial/',
    };
    expect(classifyPanelPage(g2)).toEqual(expected);
});

test("Cloudflare's challenge is told by its orchestrating script, not by its localised title or the normal jsd script", () => {
    const challenge = facts({
        title: 'Cierpliwości...',
        textLength: 304,
        scripts: ['https://www.glassdoor.com/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1?ray=a5b0'],
    });
    const realPage = facts({
        title: 'Zarezerwuj bilety online | Lufthansa',
        textLength: 6262,
        scripts: ['https://www.lufthansa.com/cdn-cgi/challenge-platform/scripts/jsd/main.js'],
    });

    expect(classifyPanelPage(challenge)).toEqual({
        state: 'challenged',
        evidence:
            'Cloudflare challenge script www.glassdoor.com/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1',
    });
    expect(classifyPanelPage(realPage).state).toBe('through');
});

test("Akamai's Access Denied and HUMAN's block page are challenges; a near-empty page is not yet through", () => {
    expect(classifyPanelPage(facts({ title: 'Access Denied', textLength: 195 })).state).toBe('challenged');
    expect(
        classifyPanelPage(facts({ title: 'Access to this page has been denied', textLength: 128, pxCaptcha: true })),
    ).toEqual({ state: 'challenged', evidence: 'HUMAN #px-captcha' });
    expect(classifyPanelPage(facts({ title: 'Priceline', textLength: 120 })).state).toBe('unclear');
});

test("Kasada's ips.js counts only while the page is empty: it stays on the real page once solved", () => {
    const ips = 'https://www.realestate.com.au/149e/2d20/ips.js?KP_UIDz=abc&x-kpsdk-im=def';

    expect(classifyPanelPage(facts({ title: '', textLength: 0, scripts: [ips] })).state).toBe('challenged');
    expect(classifyPanelPage(facts({ title: 'Real Estate', textLength: 4000, scripts: [ips] })).state).toBe('through');
});

test('vendor cookies are kept by exact name or prefix, each once', () => {
    const names = [
        '__cf_bm',
        'utag_main',
        '_px3',
        '_pxhd',
        'bm_sz',
        'ak_bmsc',
        'datadome',
        '__cf_bm',
        'KP_UIDz',
        'abck',
    ];

    expect(filterVendorCookies(names)).toEqual(['__cf_bm', '_px3', '_pxhd', 'bm_sz', 'ak_bmsc', 'datadome', 'KP_UIDz']);
});

function facts(overrides: Partial<PanelPageFacts>): PanelPageFacts {
    return {
        title: '',
        textLength: 0,
        textStart: '',
        scripts: [],
        iframes: [],
        pxCaptcha: false,
        akamaiChallenge: false,
        ...overrides,
    };
}
