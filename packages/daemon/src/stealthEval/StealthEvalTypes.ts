/** Who ran a visit: the agent's own browser, the plain headless control or the person by hand (design D9). */
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

/** What each probe of a run measured; a probe that failed is missing here and named in `probeErrors`. */
export interface RunProbes {
    shop?: ShopVisit;
}

/** One run of the eval, saved as one JSON file. */
export interface RunResult {
    runner: RunnerName;
    startedAt: string;
    finishedAt: string;
    browserVersion: string;
    probes: RunProbes;
    /** The error message of every probe that failed, by probe name. */
    probeErrors: Partial<Record<keyof RunProbes, string>>;
}
