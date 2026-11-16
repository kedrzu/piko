import {
    asArray,
    asBoolean,
    asNullableNumber,
    asNullableString,
    asNumber,
    asObject,
    asOneOf,
    asString,
} from './jsonShape.js';
import type { AllegroRun, AllegroSearch, AllegroSearchOutcome, EvalDriver } from './StealthEvalTypes.js';

/** How `runAllegroProbe` runs. */
export interface RunAllegroProbeParams {
    driver: EvalDriver;
    label: string;
    /** Between the starts of two searches. */
    intervalMs: number;
    /** The most searches one run makes. */
    cap: number;
}

const ALLEGRO_URL = 'https://allegro.pl/';
const CONSENT_BUTTON = 'button[data-role="accept-consent"]';
const SEARCH_INPUT = 'input[data-role="search-input"]';
/** How long the results (or a CAPTCHA) get after Enter. */
const RESULTS_TIMEOUT_MS = 20_000;
const RESULTS_POLL_MS = 250;
/** How long the home page gets to show its consent banner. */
const CONSENT_WAIT_MS = 3000;
const OUTCOMES: readonly AllegroSearchOutcome[] = ['results', 'captcha', 'timeout', 'error'];

/** What a person shopping on Allegro might look for, each query once per run. */
const QUERIES = [
    'młynek do kawy',
    'czajnik elektryczny',
    'słuchawki bezprzewodowe',
    'ekspres do kawy',
    'odkurzacz pionowy',
    'blender kielichowy',
    'toster',
    'frytkownica beztłuszczowa',
    'robot kuchenny',
    'patelnia ceramiczna',
    'garnki ze stali nierdzewnej',
    'nóż szefa kuchni',
    'deska do krojenia',
    'termos stalowy',
    'kubek termiczny',
    'lampka biurkowa led',
    'krzesło biurowe',
    'biurko regulowane',
    'monitor 27 cali',
    'klawiatura mechaniczna',
    'mysz bezprzewodowa',
    'powerbank 20000 mah',
    'ładowarka usb c',
    'kabel hdmi',
    'głośnik bluetooth',
    'smartwatch',
    'opaska sportowa',
    'buty do biegania',
    'plecak miejski',
    'walizka kabinowa',
    'parasol automatyczny',
    'kurtka przeciwdeszczowa',
    'rękawiczki zimowe',
    'pościel bawełniana',
    'poduszka ortopedyczna',
    'koc polarowy',
    'ręczniki kąpielowe',
    'suszarka do włosów',
    'szczoteczka soniczna',
    'waga łazienkowa',
    'nawilżacz powietrza',
    'oczyszczacz powietrza',
    'żarówka smart',
    'gra planszowa',
    'klocki konstrukcyjne',
];

/** The most searches a run can make: one per query. */
export const ALLEGRO_MAX_CAP = QUERIES.length;

/**
 * The Allegro probe (stealth-browsing D9): opens Allegro, accepts its consent banner if shown, then searches at a fixed interval,
 * typing each query into the search box and pressing Enter, until DataDome shows a CAPTCHA or the cap is reached.
 */
export async function runAllegroProbe(params: RunAllegroProbeParams): Promise<AllegroRun> {
    const { driver, label, intervalMs, cap } = params;
    await driver.open(ALLEGRO_URL);
    await Bun.sleep(CONSENT_WAIT_MS);
    const consentAccepted = await acceptConsent();

    const searches: AllegroSearch[] = [];
    for (const query of QUERIES.slice(0, cap)) {
        const startedAt = Date.now();
        const search = await searchFor(query);
        searches.push(search);
        console.log(
            `[${label}] allegro ${searches.length}/${cap}: ${query} ${search.outcome}` +
                (search.msToResults == null ? '' : ` in ${search.msToResults} ms`) +
                (search.detail == null ? '' : ` (${search.detail})`),
        );
        if (search.outcome === 'captcha') {
            break;
        }
        await Bun.sleep(Math.max(0, startedAt + intervalMs - Date.now()));
    }

    const captchaAt = searches.findIndex(search => search.outcome === 'captcha');
    return {
        intervalMs,
        cap,
        consentAccepted,
        searches,
        searchesBeforeCaptcha:
            captchaAt === -1
                ? null
                : searches.slice(0, captchaAt).filter(search => search.outcome === 'results').length,
    };

    async function acceptConsent() {
        const shown = await driver.evaluate(`document.querySelector(${JSON.stringify(CONSENT_BUTTON)}) != null`);
        if (shown !== true) {
            return false;
        }
        await driver.click(CONSENT_BUTTON);
        return true;
    }

    async function searchFor(query: string): Promise<AllegroSearch> {
        const at = new Date().toISOString();
        try {
            const state = await readState(query);
            if (state.captcha != null) {
                // Already up before this search: on arrival, or left by the previous search after its results.
                return {
                    query,
                    at,
                    msToResults: null,
                    outcome: 'captcha',
                    detail: `before searching: ${state.captcha}`,
                };
            }
            await driver.type(SEARCH_INPUT, query);
            await driver.press('Enter');
            const pressedAt = Date.now();
            // Enter navigates to the listing, and a read caught by that navigation fails: it is retried until the
            // deadline, and its error is kept only if no read succeeds after it.
            let readError: Error | null = null;
            while (Date.now() - pressedAt < RESULTS_TIMEOUT_MS) {
                try {
                    const current = await readState(query);
                    readError = null;
                    if (current.captcha != null) {
                        return { query, at, msToResults: null, outcome: 'captcha', detail: current.captcha };
                    }
                    if (current.results) {
                        return { query, at, msToResults: Date.now() - pressedAt, outcome: 'results', detail: null };
                    }
                } catch (error) {
                    readError = error instanceof Error ? error : new Error(String(error));
                }
                await Bun.sleep(RESULTS_POLL_MS);
            }
            if (readError != null) {
                throw readError;
            }
            return { query, at, msToResults: null, outcome: 'timeout', detail: null };
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            return { query, at, msToResults: null, outcome: 'error', detail };
        }
    }

    async function readState(query: string) {
        const state = asObject(await driver.evaluate(readStateExpression(query)), 'page state');
        return {
            captcha: asNullableString(state['captcha'], 'captcha'),
            results: state['results'] === true,
        };
    }
}

/**
 * Checks a saved Allegro probe's shape.
 * @__NO_SIDE_EFFECTS__
 */
export function parseAllegroRun(value: unknown): AllegroRun {
    const run = asObject(value, 'allegro');
    return {
        intervalMs: asNumber(run['intervalMs'], 'allegro.intervalMs'),
        cap: asNumber(run['cap'], 'allegro.cap'),
        consentAccepted: asBoolean(run['consentAccepted'], 'allegro.consentAccepted'),
        searches: asArray(run['searches'], 'allegro.searches').map((item, index) => {
            const at = `allegro.searches[${index}]`;
            const search = asObject(item, at);
            return {
                query: asString(search['query'], `${at}.query`),
                at: asString(search['at'], `${at}.at`),
                msToResults: asNullableNumber(search['msToResults'], `${at}.msToResults`),
                outcome: asOneOf(search['outcome'], OUTCOMES, `${at}.outcome`),
                detail: asNullableString(search['detail'], `${at}.detail`),
            };
        }),
        searchesBeforeCaptcha: asNullableNumber(run['searchesBeforeCaptcha'], 'allegro.searchesBeforeCaptcha'),
    };
}

/**
 * Whether the page shows DataDome's CAPTCHA (an iframe from `captcha-delivery.com`, also on its block page), else
 * whether the results for `query` are there: the listing's URL carries the query and offers are listed.
 */
function readStateExpression(query: string) {
    return `(() => {
    const captcha = [...document.querySelectorAll('iframe')].find(iframe => iframe.src.includes('captcha-delivery.com'));
    if (captcha) return { captcha: new URL(captcha.src).host + new URL(captcha.src).pathname };
    const onListing = location.pathname.startsWith('/listing') && new URL(location.href).searchParams.get('string') === ${JSON.stringify(query)};
    const offers = document.querySelectorAll('article, a[href*="/oferta/"]').length;
    return { captcha: null, results: onListing && offers > 0 };
})()`;
}
