import { waitUntil } from '@nzyme/utils/waitUntil.js';

import {
    asArray,
    asBoolean,
    asNullableString,
    asObject,
    asOneOf,
    asString,
    asStringArray,
    invalidShape,
} from './jsonShape.js';
import type { EvalDriver, LeakPageResult, LeakVerdict } from './StealthEvalTypes.js';

/** How `runLeakPagesProbe` runs. */
export interface RunLeakPagesProbeParams {
    driver: EvalDriver;
    label: string;
}

/** What a page's reading reduces to; `LeakPageResult` adds the page and the error. */
export interface LeakReading {
    verdict: LeakVerdict;
    failed: string[];
    details: Record<string, string>;
}

/** A fingerprint test page and how its verdict is read from the DOM. */
export interface LeakPage {
    page: string;
    url: string;
    /**
     * Expressions evaluated once before reading, each on its own, the way the agent would read the page. The rebrowser
     * page names them as what triggers its checks of the client's own evaluation.
     */
    prepare: string[];
    /** Evaluates to the page's raw results as JSON, or `null` while the page is still running its checks. */
    read: string;
    reduce(raw: unknown): LeakReading;
}

/** How long a page gets after loading before it is first read: its checks run asynchronously. */
const SETTLE_MS = 3000;
/** How long after the first read the page may still be running its checks. */
const READ_TIMEOUT_MS = 30_000;
const READ_POLL_MS = 1000;
const VERDICT_VALUES: readonly LeakVerdict[] = ['pass', 'fail', 'unknown'];

/**
 * The fingerprint test pages (stealth-browsing D6). Every `read` was written against the page's live DOM on 2026-11-15, from a
 * plain headless Chromium and a headed Chrome; a page that changes its DOM reads as `unknown` with the error.
 */
export const LEAK_PAGES: LeakPage[] = [
    {
        page: 'sannysoft',
        url: 'https://bot.sannysoft.com/',
        prepare: [],
        // Both tables: a row is a test name and a result cell whose class is `passed`, `failed` or `warn`. The name cell
        // carries an `(Old)`/`(New)` tag in a `.age` span.
        read: `(() => {
            const rows = [...document.querySelectorAll('table tr')].flatMap(tr => {
                if (tr.cells.length < 2) return [];
                const name = tr.cells[0].cloneNode(true);
                for (const age of name.querySelectorAll('.age')) age.remove();
                return [{ name: name.textContent.trim().replace(/\\s+/g, ' '), status: tr.cells[1].className }];
            });
            return rows.length >= 20 ? rows : null;
        })()`,
        reduce: reduceSannysoft,
    },
    {
        page: 'rebrowser',
        url: 'https://bot-detector.rebrowser.net/',
        // The page's own instructions: the first triggers `sourceUrlLeak`, the second `mainWorldExecution`, both only if
        // the client's evaluation is visible to the page. Nothing else it suggests (`window.dummyFn()`,
        // `exposeFunction`, init scripts) is something the agent does.
        prepare: [
            "document.getElementById('detections-json') ? true : false",
            "document.getElementsByClassName('div').length",
        ],
        // A row's first cell is an icon and the test's name: 🔴 failed, 🟡 warning, 🟢 passed, ⚪️ not triggered.
        read: `(() => {
            const rows = [...document.querySelectorAll('#detections-table tbody tr')].map(tr => tr.cells[0].textContent.trim());
            return rows.length >= 10 ? rows : null;
        })()`,
        reduce: reduceRebrowser,
    },
    {
        page: 'botd',
        url: 'https://fingerprintjs.github.io/BotD/main/',
        prepare: [],
        read: `(() => {
            const result = document.getElementById('detection-result')?.textContent.trim();
            const detectors = document.getElementById('detectors')?.textContent.trim();
            return result && detectors ? { result: JSON.parse(result), detectors: JSON.parse(detectors) } : null;
        })()`,
        reduce: reduceBotd,
    },
    {
        page: 'creepjs',
        url: 'https://abrahamjuliot.github.io/creepjs/',
        prepare: [],
        // Each rating reads "94% like headless: <hash>"; its modal lists the signals as "name: true|false" lines.
        read: `(() => {
            const ratings = {};
            for (const kind of ['like-headless', 'headless', 'stealth']) {
                const element = document.querySelector('.' + kind + '-rating');
                if (!element) return null;
                const lines = [...(element.querySelector('.modal-content div')?.childNodes ?? [])]
                    .filter(node => node.nodeType === Node.TEXT_NODE)
                    .map(node => node.textContent.trim())
                    .filter(Boolean);
                ratings[kind] = { rating: element.firstChild?.textContent.trim() ?? '', signals: lines };
            }
            return ratings;
        })()`,
        reduce: reduceCreepjs,
    },
    {
        page: 'browserscan',
        url: 'https://www.browserscan.net/bot-detection',
        prepare: [],
        // The class names are generated, so the reading goes by structure: "Test Results:" and the verdict beside it;
        // the summary list under it, where a flagged category's label has a class and a clean one has none; and a
        // row per check, its name in an h3 and its result ("Robot" or "Normal") in the row's span.
        read: `(() => {
            const heading = [...document.querySelectorAll('strong')].find(strong => strong.textContent.trim() === 'Test Results:');
            const verdict = heading?.parentElement?.querySelectorAll('strong')[1]?.textContent.trim();
            if (!verdict) return null;
            const summary = [...(heading.parentElement.nextElementSibling?.querySelectorAll('li') ?? [])].map(li => {
                const label = li.querySelector('div');
                return { label: label?.textContent.trim() ?? '', flagged: (label?.className ?? '') !== '' };
            });
            const checks = [...document.querySelectorAll('h3')].flatMap(h3 => {
                const result = h3.parentElement?.parentElement?.parentElement?.querySelector('span')?.textContent.trim();
                return result === 'Robot' || result === 'Normal' ? [{ name: h3.textContent.trim(), result }] : [];
            });
            return { verdict, summary, checks };
        })()`,
        reduce: reduceBrowserscan,
    },
    {
        page: 'deviceandbrowserinfo',
        url: 'https://deviceandbrowserinfo.com/are_you_a_bot',
        prepare: [],
        read: `(() => {
            const text = document.getElementById('jsonResult')?.textContent.trim();
            if (!text) return null;
            try { return JSON.parse(text); } catch { return null; }
        })()`,
        reduce: reduceDeviceAndBrowserInfo,
    },
];

/**
 * The leak probe (stealth-browsing D6): opens every test page once, waits until it has finished its checks and reads its
 * verdict. A page that cannot be read is recorded as `unknown` with the error; the other pages still run.
 */
export async function runLeakPagesProbe(params: RunLeakPagesProbeParams): Promise<LeakPageResult[]> {
    const { driver, label } = params;
    const results: LeakPageResult[] = [];
    for (const page of LEAK_PAGES) {
        console.log(`[${label}] leaks: ${page.page}`);
        try {
            const reading = page.reduce(await readPage(page));
            results.push({ page: page.page, url: page.url, ...reading, error: null });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[${label}] leaks: ${page.page} could not be read: ${message}`);
            results.push({
                page: page.page,
                url: page.url,
                verdict: 'unknown',
                failed: [],
                details: {},
                error: message,
            });
        }
    }
    return results;

    async function readPage(page: LeakPage) {
        await driver.open(page.url);
        await Bun.sleep(SETTLE_MS);
        for (const expression of page.prepare) {
            await driver.evaluate(expression);
        }
        let raw: unknown = null;
        await waitUntil(
            async () => {
                raw = await driver.evaluate(page.read);
                return raw != null;
            },
            {
                intervalMs: READ_POLL_MS,
                timeoutMs: READ_TIMEOUT_MS,
                onTimeout: () => {
                    throw new Error(`the page did not finish its checks in ${READ_TIMEOUT_MS} ms`);
                },
            },
        );
        return raw;
    }
}

/**
 * Checks a saved leak probe's shape.
 * @__NO_SIDE_EFFECTS__
 */
export function parseLeakPageResults(value: unknown): LeakPageResult[] {
    return asArray(value, 'leaks').map((item, index) => {
        const at = `leaks[${index}]`;
        const result = asObject(item, at);
        const details: Record<string, string> = {};
        for (const [key, detail] of Object.entries(asObject(result['details'], `${at}.details`))) {
            details[key] = asString(detail, `${at}.details.${key}`);
        }
        return {
            page: asString(result['page'], `${at}.page`),
            url: asString(result['url'], `${at}.url`),
            verdict: asOneOf(result['verdict'], VERDICT_VALUES, `${at}.verdict`),
            failed: asStringArray(result['failed'], `${at}.failed`),
            details,
            error: asNullableString(result['error'], `${at}.error`),
        };
    });
}

function reduceSannysoft(raw: unknown): LeakReading {
    const failed: string[] = [];
    const warnings: string[] = [];
    for (const [index, item] of asArray(raw, 'rows').entries()) {
        const row = asObject(item, `rows[${index}]`);
        const name = asString(row['name'], `rows[${index}].name`);
        const status = asString(row['status'], `rows[${index}].status`).split(/\s+/);
        if (status.includes('failed')) {
            failed.push(name);
        } else if (status.includes('warn')) {
            warnings.push(name);
        }
    }
    return { verdict: failed.length > 0 ? 'fail' : 'pass', failed, details: listDetail('warnings', warnings) };
}

function reduceRebrowser(raw: unknown): LeakReading {
    const failed: string[] = [];
    const warnings: string[] = [];
    const notTriggered: string[] = [];
    for (const [index, item] of asArray(raw, 'rows').entries()) {
        const cell = asString(item, `rows[${index}]`);
        const name = cell.split(/\s+/).at(-1) ?? cell;
        if (cell.startsWith('🔴')) {
            failed.push(name);
        } else if (cell.startsWith('🟡')) {
            warnings.push(name);
        } else if (cell.startsWith('⚪')) {
            notTriggered.push(name);
        }
    }
    return {
        verdict: failed.length > 0 ? 'fail' : 'pass',
        failed,
        details: { ...listDetail('warnings', warnings), ...listDetail('notTriggered', notTriggered) },
    };
}

function reduceBotd(raw: unknown): LeakReading {
    const reading = asObject(raw, 'reading');
    const result = asObject(reading['result'], 'result');
    const failed: string[] = [];
    for (const [name, detector] of Object.entries(asObject(reading['detectors'], 'detectors'))) {
        if (asBoolean(asObject(detector, name)['bot'], `${name}.bot`)) {
            failed.push(name);
        }
    }
    const bot = asBoolean(result['bot'], 'result.bot');
    const botKind = result['botKind'];
    return {
        verdict: bot ? 'fail' : 'pass',
        failed,
        details: typeof botKind === 'string' ? { botKind } : {},
    };
}

function reduceCreepjs(raw: unknown): LeakReading {
    const ratings = asObject(raw, 'ratings');
    const likeHeadless = readRating('like-headless');
    const headless = readRating('headless');
    const stealth = readRating('stealth');
    return {
        // "Like headless" counts traits a real headed Chrome shares too; only headless and stealth say automation.
        verdict: headless.percent > 0 || stealth.percent > 0 ? 'fail' : 'pass',
        failed: [
            ...headless.signals.map(name => `headless:${name}`),
            ...stealth.signals.map(name => `stealth:${name}`),
        ],
        details: {
            likeHeadless: `${likeHeadless.percent}%`,
            headless: `${headless.percent}%`,
            stealth: `${stealth.percent}%`,
            ...listDetail('likeHeadlessSignals', likeHeadless.signals),
        },
    };

    /** The rating's percentage and the names of its signals that are on. */
    function readRating(kind: string) {
        const rating = asObject(ratings[kind], kind);
        const text = asString(rating['rating'], `${kind}.rating`);
        const percent = /(\d+)%/.exec(text)?.[1];
        if (percent == null) {
            throw invalidShape(`${kind}.rating`, `has no percentage: ${text}`);
        }
        const signals = asStringArray(rating['signals'], `${kind}.signals`).flatMap(line => {
            const [name, value] = line.split(':').map(part => part.trim());
            return value === 'true' && name ? [name] : [];
        });
        return { percent: Number(percent), signals };
    }
}

function reduceBrowserscan(raw: unknown): LeakReading {
    const reading = asObject(raw, 'reading');
    const verdict = asString(reading['verdict'], 'verdict');
    const failed: string[] = [];
    for (const [index, item] of asArray(reading['summary'], 'summary').entries()) {
        const entry = asObject(item, `summary[${index}]`);
        if (asBoolean(entry['flagged'], `summary[${index}].flagged`)) {
            // The summary's categories ("Webdriver", "User-Agent") overlap the checks' names ("WebDriver"), so they are
            // told apart.
            failed.push(`summary:${asString(entry['label'], `summary[${index}].label`)}`);
        }
    }
    for (const [index, item] of asArray(reading['checks'], 'checks').entries()) {
        const check = asObject(item, `checks[${index}]`);
        const name = asString(check['name'], `checks[${index}].name`);
        if (check['result'] === 'Robot') {
            failed.push(name);
        }
    }
    return { verdict: failed.length > 0 ? 'fail' : 'pass', failed, details: { verdict } };
}

function reduceDeviceAndBrowserInfo(raw: unknown): LeakReading {
    const reading = asObject(raw, 'reading');
    const failed: string[] = [];
    for (const [name, value] of Object.entries(asObject(reading['details'], 'details'))) {
        if (value === true) {
            failed.push(name);
        }
    }
    return { verdict: asBoolean(reading['isBot'], 'isBot') ? 'fail' : 'pass', failed, details: {} };
}

/** A detail listing names, left out when there are none. */
function listDetail(key: string, names: string[]): Record<string, string> {
    return names.length > 0 ? { [key]: names.join(', ') } : {};
}
