import { chromium } from 'playwright';

import type { EvalDriver } from './StealthEvalTypes.js';

/**
 * The known-bot control (stealth-browsing D9): Playwright's bundled Chromium, headless, launched plain with no flags, so it
 * looks exactly as automated as it is.
 */
export async function createPlaywrightDriver(): Promise<EvalDriver> {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    return {
        open: async url => {
            await page.goto(url);
        },
        click: selector => page.click(selector),
        type: (selector, text) => page.fill(selector, text),
        press: key => page.keyboard.press(key),
        select: async (selector, value) => {
            await page.selectOption(selector, value);
        },
        // Playwright fills a date input from an ISO date.
        pickDate: (selector, isoDate) => page.fill(selector, isoDate),
        scrollBy: px => page.mouse.wheel(0, px),
        scrollTo: selector => page.locator(selector).scrollIntoViewIfNeeded(),
        evaluate: expression => page.evaluate(expression),
        cookieNames: async () => (await page.context().cookies(page.url())).map(cookie => cookie.name),
        browserVersion: () => Promise.resolve(`HeadlessChrome/${browser.version()}`),
        close: () => browser.close(),
    };
}
