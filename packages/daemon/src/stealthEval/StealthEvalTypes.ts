/** Who ran a visit: the agent's own browser, the plain headless control or the person by hand (stealth-browsing D9). */
export type RunnerName = 'agent' | 'headless' | 'person';

/**
 * One abstract step of a scripted visit. The drivers turn it into commands; the person's instructions are rendered from
 * it too, so every runner does the same thing. `label` names the target in Polish for the person; `instruction`
 * replaces the generated instruction where the generic one would mislead.
 */
export type ScenarioStep =
    | { kind: 'open'; url: string; instruction?: string }
    | { kind: 'click'; selector: string; label: string; instruction?: string }
    | { kind: 'type'; selector: string; text: string; label: string; instruction?: string }
    | { kind: 'press'; key: string; instruction?: string }
    | { kind: 'select'; selector: string; value: string; label: string; instruction?: string }
    | { kind: 'pickDate'; selector: string; date: string; label: string; instruction?: string }
    | { kind: 'scrollBy'; px: number; instruction?: string }
    | { kind: 'scrollTo'; selector: string; label: string; instruction?: string }
    | { kind: 'wait'; ms: number; instruction?: string };

/** Drives one browser through scenario steps; the agent's driver goes through agent-browser, the control's Playwright. */
export interface EvalDriver {
    open(url: string): Promise<void>;
    click(selector: string): Promise<void>;
    /** Puts text into a field the way this runner normally does (agent-browser's `fill`, Playwright's `fill`). */
    type(selector: string, text: string): Promise<void>;
    press(key: string): Promise<void>;
    select(selector: string, value: string): Promise<void>;
    /** Sets a date input to an ISO date (`2026-11-22`). */
    pickDate(selector: string, isoDate: string): Promise<void>;
    scrollBy(px: number): Promise<void>;
    scrollTo(selector: string): Promise<void>;
    /** Evaluates a JavaScript expression in the page; resolves with its value, which must be JSON. */
    evaluate(expression: string): Promise<unknown>;
    /** The names of the cookies the browser would send to the current page. */
    cookieNames(): Promise<string[]>;
    /** The browser's product and version, e.g. `Chrome/157.0.8103.78`. */
    browserVersion(): Promise<string>;
    /** Ends the driver's session; the browser itself is the caller's. */
    close(): Promise<void>;
}

/** One action the test shop scored, as the page records it in `#eval-results`. */
export interface ShopAction {
    action: string;
    page: string;
    at: string;
    score: number | null;
    reasons: string[];
    /** `null` with `error: null` while the token or its assessment is still pending. */
    valid: boolean | null;
    error: string | null;
}

/** A click as the shop recorded it, with the pointer movement since the previous click. */
export interface ShopClickRecord {
    kind: 'click';
    at: string;
    target: string;
    isTrusted: boolean;
    pointerType: string;
    mouseMovesBefore: number;
    pathPxBefore: number;
    msSinceLastMove: number | null;
    offsetFromCenter: { x: number; y: number };
}

/** One focus-to-blur session on a text field. */
export interface ShopTextRecord {
    kind: 'text';
    at: string;
    target: string;
    chars: number;
    keydowns: number;
    inputEvents: number;
    insertTextWithoutKey: number;
    pastes: number;
    meanKeyIntervalMs: number | null;
    minKeyIntervalMs: number | null;
}

/** Scrolling on one page, written when the page is left. */
export interface ShopScrollRecord {
    kind: 'scroll';
    at: string;
    page: string;
    wheelEvents: number;
    scrollEvents: number;
    maxScrollPct: number;
}

/** How one piece of input arrived. */
export type ShopInputRecord = ShopClickRecord | ShopTextRecord | ShopScrollRecord;

/** The test shop's whole visit: what `#eval-results` holds and "Copy results" copies. */
export interface ShopVisit {
    version: 1;
    visitId: string;
    startedAt: string;
    userAgent: string;
    actions: ShopAction[];
    input: ShopInputRecord[];
}

/** How a leak test page judged the browser: `unknown` when the page never finished or its verdict could not be read. */
export type LeakVerdict = 'pass' | 'fail' | 'unknown';

/** One fingerprint test page's verdict (stealth-browsing D6). */
export interface LeakPageResult {
    page: string;
    url: string;
    verdict: LeakVerdict;
    /** The names of the page's individual checks that failed, as the page names them. */
    failed: string[];
    /** Page-specific readings beyond pass and fail, e.g. CreepJS's percentages or BotD's bot kind. */
    details: Record<string, string>;
    /** Why the verdict is `unknown`. */
    error: string | null;
}

/** The protection vendors the panel covers (stealth-browsing D6). */
export type PanelVendor = 'Cloudflare' | 'Akamai' | 'HUMAN' | 'Kasada' | 'DataDome';

/** Whether one load of a protected site reached the real site. */
export type PanelOutcome = 'through' | 'challenged' | 'error';

/** One panel site loaded once. */
export interface PanelSiteResult {
    vendor: PanelVendor;
    url: string;
    outcome: PanelOutcome;
    /** The marker that decided the outcome, e.g. `DataDome iframe geo.captcha-delivery.com/captcha` or the title. */
    evidence: string;
    title: string;
    /** The names of the protection vendors' cookies the browser holds for the site, any vendor's. */
    vendorCookies: string[];
    elapsedMs: number;
}

/** How one Allegro search ended: results, a DataDome CAPTCHA, neither in time, or a failed command. */
export type AllegroSearchOutcome = 'results' | 'captcha' | 'timeout' | 'error';

/** One search on Allegro. */
export interface AllegroSearch {
    query: string;
    at: string;
    /** From pressing Enter until the results were there; `null` when they never were. */
    msToResults: number | null;
    outcome: AllegroSearchOutcome;
    /** The CAPTCHA's marker or the error. */
    detail: string | null;
}

/** Allegro searches at a fixed interval until DataDome shows a CAPTCHA or the cap is reached (stealth-browsing D9). */
export interface AllegroRun {
    intervalMs: number;
    cap: number;
    consentAccepted: boolean;
    searches: AllegroSearch[];
    /** The searches that got results before the first CAPTCHA; `null` when none came within the cap. */
    searchesBeforeCaptcha: number | null;
}

/** What each probe of a run measured; a probe that failed or did not run is missing here. */
export interface RunProbes {
    shop?: ShopVisit;
    leaks?: LeakPageResult[];
    panel?: PanelSiteResult[];
    allegro?: AllegroRun;
}

/** A probe's name, as `--probes` takes it. */
export type ProbeName = keyof RunProbes;

/** Every probe, in the order a run runs them. */
export const PROBE_NAMES: readonly ProbeName[] = ['shop', 'leaks', 'panel', 'allegro'];

/** One run of the eval, saved as one JSON file. */
export interface RunResult {
    runner: RunnerName;
    startedAt: string;
    finishedAt: string;
    browserVersion: string;
    probes: RunProbes;
    /** The error message of every probe that failed, by probe name. */
    probeErrors: Partial<Record<ProbeName, string>>;
}
