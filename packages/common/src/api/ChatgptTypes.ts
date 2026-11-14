/**
 * Whether OpenCode's `openai` integration in the sandbox is signed in with ChatGPT. The sign-in carries no email and no
 * plan (its token holds only an account id), so there is nothing more to report.
 */
export type ChatgptStatus = { connected: false } | { connected: true };

/** A ChatGPT sign-in the daemon started. */
export interface ChatgptLoginStartResult {
    /** OpenAI's sign-in page; the app opens it in the system browser. */
    url: string;
}

/**
 * Where the ChatGPT sign-in stands. The page ends by sending the browser back to the daemon, which passes it on to the
 * sandbox, so there is no code to paste: the app asks for this until it is no longer `pending`.
 */
export type ChatgptLoginState =
    /** Waiting for the person to sign in; `url` is the page to reopen. */
    | { state: 'pending'; url: string }
    | { state: 'connected' }
    /** OpenAI refused the sign-in or it broke off on its side: start a new one. */
    | { state: 'failed' }
    /** No sign-in is waiting (cancelled, timed out, or the daemon restarted): start a new one. */
    | { state: 'expired' };
