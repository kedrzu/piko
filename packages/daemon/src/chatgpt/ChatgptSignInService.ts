import { defineService } from '@nzyme/ioc/Service.js';
import { ApplicationError } from '@nzyme/logging/ApplicationError.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { waitUntil } from '@nzyme/utils/waitUntil.js';

import type { ChatgptLoginStartResult, ChatgptLoginState, ChatgptStatus } from '@piko/common/api/ChatgptTypes.js';
import { OpencodeIntegrationGetCommand } from '@piko/opencode/OpencodeIntegrationGetCommand.js';
import type { OpencodeIntegration } from '@piko/opencode/OpencodeIntegrationGetCommand.js';
import { OpencodeIntegrationOauthCancelCommand } from '@piko/opencode/OpencodeIntegrationOauthCancelCommand.js';
import { OpencodeIntegrationOauthStartCommand } from '@piko/opencode/OpencodeIntegrationOauthStartCommand.js';
import { OpencodeIntegrationOauthStatusCommand } from '@piko/opencode/OpencodeIntegrationOauthStatusCommand.js';

import { ActiveProviderStore } from '../ai/ActiveProviderStore.js';
import { Sandbox } from '../sandbox/Sandbox.js';
import { assertSandboxReady } from '../sandbox/assertSandboxReady.js';
import { redact } from '../utils/redact.js';
import { startLoginCallbackRelay } from './startLoginCallbackRelay.js';
import type { LoginCallbackRelay } from './startLoginCallbackRelay.js';

/**
 * The agent's ChatGPT sign-in: OpenCode's `openai` integration in the sandbox, signed in through OpenAI's page. The page
 * ends by sending the browser to `127.0.0.1:<port>`, a port that listens only inside the sandbox, so while a sign-in
 * waits the daemon listens on that port of the computer and passes the callback on (`startLoginCallbackRelay`). One
 * sign-in at a time; it ends on a new start, a cancel, its outcome, and its expiry. The daemon never sees ChatGPT's
 * token. Every method but `cancelLogin()` needs a ready sandbox and throws an `HttpError` 409 (`SandboxNotReady`)
 * otherwise.
 */
export interface ChatgptSignInServiceShape {
    /**
     * Whether the `openai` integration has a connection. Waits for OpenCode to load its integrations, and throws when
     * it has no `openai` integration at all: that is a broken agent, not a signed-out one.
     */
    getStatus(): Promise<ChatgptStatus>;
    /** Starts a new sign-in, ending one already waiting. Throws when the callback's port is taken on the computer. */
    startLogin(): Promise<ChatgptLoginStartResult>;
    /** Where the sign-in stands; a connected one is recorded as the active provider. */
    getLoginState(): Promise<ChatgptLoginState>;
    /**
     * Ends the waiting sign-in, if any. Works with the sandbox not ready too: the port is closed, and only cancelling
     * the attempt in OpenCode is skipped.
     */
    cancelLogin(): Promise<void>;
}

/** A sign-in waiting for the person to finish it in the browser. */
interface Login {
    attemptId: string;
    url: string;
    relay: LoginCallbackRelay;
    /** Values that must never reach a log: the `state`, and the authorization code once the callback brought it. */
    secrets: string[];
    timeout: ReturnType<typeof setTimeout>;
}

/** Where the sign-in's callback goes, from its `redirect_uri`. */
interface LoginCallback {
    port: number;
    path: string;
    state: string;
}

/** OpenCode's integration, and model provider, that runs the agent on a ChatGPT sign-in. */
export const CHATGPT_INTEGRATION = 'openai';
const CHATGPT_LOGIN_METHOD = 'chatgpt-token-sharing';
/** How long a sign-in waits when OpenCode reports no expiry of its own. */
const LOGIN_TIMEOUT_MS = 10 * 60_000;
/** OpenCode loads its integrations a moment after it starts answering. */
const INTEGRATION_LOAD_TIMEOUT_MS = 30_000;
/** How long the sign-in in the sandbox may take to answer its callback. */
const FORWARD_TIMEOUT_S = 30;

/** The agent's ChatGPT sign-in and the relay of its callback into the sandbox. */
export const ChatgptSignInService = defineService({
    name: 'ChatgptSignInService',
    deps: {
        sandbox: Sandbox,
        logger: Logger,
        activeProvider: ActiveProviderStore,
        getIntegration: OpencodeIntegrationGetCommand,
        startAttempt: OpencodeIntegrationOauthStartCommand,
        getAttemptStatus: OpencodeIntegrationOauthStatusCommand,
        cancelAttempt: OpencodeIntegrationOauthCancelCommand,
    },
    setup({
        sandbox,
        logger,
        activeProvider,
        getIntegration,
        startAttempt,
        getAttemptStatus,
        cancelAttempt,
    }): ChatgptSignInServiceShape {
        let login: Login | undefined;
        /** Sign-in operations run one after another, so two calls never race for the one sign-in and its port. */
        let loginQueue: Promise<unknown> = Promise.resolve();

        return {
            getStatus,
            startLogin: () => runExclusive(startLoginNow),
            getLoginState: () => runExclusive(getLoginStateNow),
            cancelLogin: () => runExclusive(endLogin),
        };

        async function getStatus(): Promise<ChatgptStatus> {
            assertSandboxReady(sandbox);
            let integration: OpencodeIntegration | undefined;
            await waitUntil(
                async () => {
                    integration = await getIntegration(CHATGPT_INTEGRATION);
                    return integration !== undefined;
                },
                {
                    intervalMs: 500,
                    timeoutMs: INTEGRATION_LOAD_TIMEOUT_MS,
                    onTimeout: () => {
                        throw new Error(`OpenCode has no ${CHATGPT_INTEGRATION} integration`);
                    },
                },
            );
            return integration?.connected ? { connected: true } : { connected: false };
        }

        async function startLoginNow(): Promise<ChatgptLoginStartResult> {
            assertSandboxReady(sandbox);
            await endLogin();

            const attempt = await startAttempt({ integrationId: CHATGPT_INTEGRATION, methodId: CHATGPT_LOGIN_METHOD });
            let relay: LoginCallbackRelay;
            const secrets: string[] = [];
            try {
                const callback = parseLoginCallback(attempt.url);
                secrets.push(callback.state);
                relay = startLoginCallbackRelay({
                    port: callback.port,
                    callbackPath: callback.path,
                    state: callback.state,
                    forward: pathAndQuery => forwardCallback({ port: callback.port, pathAndQuery, secrets }),
                });
            } catch (error) {
                logger.warn('ChatGPT sign-in callback relay not started', { error });
                await cancelAttempt({ integrationId: CHATGPT_INTEGRATION, attemptId: attempt.attemptId }).catch(
                    (cancelError: unknown) => {
                        logger.warn('ChatGPT sign-in not cancelled in OpenCode', { error: cancelError });
                    },
                );
                throw error;
            }

            const timeoutMs =
                attempt.expiresAt != null ? Math.max(0, attempt.expiresAt - Date.now()) : LOGIN_TIMEOUT_MS;
            const started: Login = {
                attemptId: attempt.attemptId,
                url: attempt.url,
                relay,
                secrets,
                timeout: setTimeout(() => void runExclusive(() => expireLogin(started)), timeoutMs),
            };
            login = started;
            // Not the URL: it carries the `state`.
            logger.info('ChatGPT sign-in started', { timeoutMs });
            return { url: attempt.url };
        }

        async function getLoginStateNow(): Promise<ChatgptLoginState> {
            assertSandboxReady(sandbox);
            const current = login;
            if (current === undefined) {
                return { state: 'expired' };
            }

            const attempt = await getAttemptStatus({
                integrationId: CHATGPT_INTEGRATION,
                attemptId: current.attemptId,
            });
            if (attempt === undefined) {
                logger.info('ChatGPT sign-in unknown to OpenCode, expired');
                closeLogin();
                return { state: 'expired' };
            }

            switch (attempt.status) {
                case 'pending':
                    return { state: 'pending', url: current.url };
                case 'complete':
                    closeLogin();
                    await activeProvider.set('chatgpt');
                    logger.info('ChatGPT signed in');
                    return { state: 'connected' };
                case 'failed':
                    logger.warn('ChatGPT sign-in failed', {
                        message: redact(attempt.message, current.secrets).slice(-2000),
                    });
                    closeLogin();
                    return { state: 'failed' };
                case 'expired':
                    logger.info('ChatGPT sign-in expired');
                    closeLogin();
                    return { state: 'expired' };
                default:
                    return assertNever(attempt);
            }
        }

        async function expireLogin(expired: Login) {
            if (login === expired) {
                logger.info('ChatGPT sign-in timed out');
                await endLogin();
            }
        }

        /**
         * Ends a sign-in before its outcome: closes it, and cancels it in OpenCode when the sandbox is ready. Cancelling
         * is best-effort, a failure logged and not thrown: the port is closed either way, and OpenCode expires the
         * attempt itself.
         */
        async function endLogin() {
            const ended = closeLogin();
            if (ended === undefined) {
                return;
            }
            if (sandbox.getState().status !== 'ready') {
                logger.info('ChatGPT sign-in not cancelled in OpenCode, sandbox not ready');
                return;
            }

            try {
                await cancelAttempt({ integrationId: CHATGPT_INTEGRATION, attemptId: ended.attemptId });
            } catch (error) {
                logger.warn('ChatGPT sign-in not cancelled in OpenCode', { error });
            }
        }

        /** Closes the relay and forgets the sign-in, returning it; enough once OpenCode has ended the attempt. */
        function closeLogin() {
            const closed = login;
            if (closed !== undefined) {
                login = undefined;
                clearTimeout(closed.timeout);
                closed.relay.stop();
            }
            return closed;
        }

        /**
         * Sends the browser's callback to the sign-in waiting inside the sandbox, with `curl` in the agent's container,
         * and turns its answer into the browser's response. The URL, which carries the code and `state`, goes to curl
         * on stdin (`--config -`), never in its arguments, where any process of the VM could read it.
         */
        async function forwardCallback(params: ForwardCallbackParams): Promise<Response> {
            const code = new URL(params.pathAndQuery, 'http://127.0.0.1').searchParams.get('code');
            if (code) {
                params.secrets.push(code);
            }

            try {
                const child = sandbox.exec({
                    command: [
                        'curl',
                        '--silent',
                        '--show-error',
                        '--max-time',
                        String(FORWARD_TIMEOUT_S),
                        '--include',
                        '--config',
                        '-',
                    ],
                });
                child.stdin.write(
                    `url = "${escapeCurlConfig(`http://127.0.0.1:${params.port}${params.pathAndQuery}`)}"\n`,
                );
                child.stdin.end();
                const [stdout, stderr, exitCode] = await Promise.all([
                    new Response(child.stdout).text(),
                    new Response(child.stderr).text(),
                    child.exited,
                ]);

                const response = exitCode === 0 ? parseCurlResponse(stdout) : undefined;
                if (response === undefined) {
                    logger.warn('ChatGPT sign-in callback not forwarded', {
                        exitCode,
                        stderr: redact(stderr, params.secrets).slice(-2000),
                    });
                    return forwardFailedResponse();
                }

                logger.info('ChatGPT sign-in callback forwarded', { status: response.status });
                return response;
            } catch (error) {
                logger.warn('ChatGPT sign-in callback not forwarded', { error });
                return forwardFailedResponse();
            }
        }

        function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
            const result = loginQueue.then(operation, operation);
            loginQueue = result.catch(() => undefined);
            return result;
        }
    },
});

/** Params of `forwardCallback`. */
interface ForwardCallbackParams {
    port: number;
    /** The callback's path and query, carrying the code and `state`. */
    pathAndQuery: string;
    /** The sign-in's secrets; the code is added once the callback brings it. */
    secrets: string[];
}

/**
 * The callback from the sign-in page's `redirect_uri` and `state`. The error never quotes the URL: it carries the
 * `state`.
 */
function parseLoginCallback(attemptUrl: string): LoginCallback {
    // `URL.parse`, not `new URL`: the latter's error quotes the input.
    const query = URL.parse(attemptUrl)?.searchParams;
    const redirectUri = query?.get('redirect_uri');
    const state = query?.get('state');
    const redirect = redirectUri ? URL.parse(redirectUri) : null;
    if (!redirect || !state) {
        throw new Error('The ChatGPT sign-in page has no redirect_uri or state');
    }

    const port = Number(redirect.port);
    if (redirect.protocol !== 'http:' || redirect.hostname !== '127.0.0.1' || !Number.isInteger(port) || port <= 0) {
        throw new ApplicationError('The ChatGPT sign-in redirects somewhere other than a loopback port', {
            protocol: redirect.protocol,
            hostname: redirect.hostname,
            port: redirect.port,
        });
    }

    return { port, path: redirect.pathname, state };
}

/** Escapes a value for a double-quoted string of a curl config file, where `\` starts an escape. */
function escapeCurlConfig(value: string) {
    return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

/**
 * The response printed by `curl --include`: its status line, headers, and body. Only the status and `Content-Type` are
 * passed on; the body is decoded by curl already, so its transfer headers no longer apply. `undefined` when the output
 * holds no HTTP response.
 */
function parseCurlResponse(output: string): Response | undefined {
    const headerEnd = output.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
        return undefined;
    }

    const [statusLine = '', ...headerLines] = output.slice(0, headerEnd).split('\r\n');
    const status = Number(/^HTTP\/\S+ (\d{3})/.exec(statusLine)?.[1]);
    if (!Number.isInteger(status) || status < 200 || status > 599) {
        return undefined;
    }

    const headers = new Headers();
    for (const line of headerLines) {
        const match = /^content-type:\s*(.+)$/i.exec(line);
        if (match?.[1]) {
            headers.set('Content-Type', match[1]);
        }
    }
    return new Response(output.slice(headerEnd + 4), { status, headers });
}

/** What the browser gets when the callback could not reach the sign-in; never the URL, which carries the code. */
function forwardFailedResponse() {
    return new Response('The sign-in could not be passed on to the agent. Go back to piko and try again.', {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
}
