import { HttpError } from '@nzyme/fetch-utils/HttpError.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { createSingleRunner } from '@nzyme/utils/createSingleRunner.js';
import { computed, reactive, ref } from 'vue';

import { AiStatusGetEndpoint } from '@piko/common/api/AiStatusGetEndpoint.js';
import type { AiProvider, AiStatus } from '@piko/common/api/AiTypes.js';
import { ChatgptLoginCancelEndpoint } from '@piko/common/api/ChatgptLoginCancelEndpoint.js';
import { ChatgptLoginStartEndpoint } from '@piko/common/api/ChatgptLoginStartEndpoint.js';
import { ChatgptLoginStateGetEndpoint } from '@piko/common/api/ChatgptLoginStateGetEndpoint.js';
import type { ChatgptLoginState } from '@piko/common/api/ChatgptTypes.js';
import { ClaudeLoginCompleteEndpoint } from '@piko/common/api/ClaudeLoginCompleteEndpoint.js';
import { ClaudeLoginStartEndpoint } from '@piko/common/api/ClaudeLoginStartEndpoint.js';
import type { ClaudeLoginResult } from '@piko/common/api/ClaudeTypes.js';
import { SandboxStartEndpoint } from '@piko/common/api/SandboxStartEndpoint.js';
import { SandboxStatusGetEndpoint } from '@piko/common/api/SandboxStatusGetEndpoint.js';
import type { SandboxStatus } from '@piko/common/api/SandboxTypes.js';

import { DaemonClient } from '@/daemon/DaemonClient.js';

/** Where the first run stands, which decides the screens the app may show (`setupGuardPlugin`). */
export type SetupProgress = 'sandboxNotReady' | 'aiStatusFailed' | 'aiNotConnected' | 'aiPlanNotAllowed' | 'done';

/** The account of a sign-in finished in this app session. */
export interface SetupSignIn {
    provider: AiProvider;
    /** `null` when the provider reports none (a ChatGPT sign-in never does). */
    email: string | null;
    /** `null` when the provider reports none (a ChatGPT sign-in never does). */
    plan: string | null;
}

/** How often the sandbox's status is asked for, in ms. */
const SANDBOX_POLL_INTERVAL_MS = 500;

/**
 * The first run's state as the daemon reports it: the sandbox's status, the active AI provider's sign-in, and the
 * sign-in pages of the Claude and ChatGPT logins the person has started. The sandbox's status is polled for as long as the app runs, so a sandbox that
 * stops being ready is noticed on any screen (and the daemon, asked, starts it again).
 */
export const SetupStore = defineService({
    name: 'SetupStore',
    deps: { daemon: DaemonClient },
    setup({ daemon }) {
        /** `null` until the daemon answers, and while it does not. */
        const sandbox = ref<SandboxStatus | null>(null);
        /** `null` until asked, and while the sandbox is not ready. */
        const ai = ref<AiStatus | null>(null);
        /** Why the daemon could not tell the AI provider's status, when it last could not. */
        const aiError = ref<string | null>(null);
        /** The last sign-in finished in this app session, to either provider; `null` before one. */
        const signIn = ref<SetupSignIn | null>(null);
        /** The page of the Claude sign-in waiting for its code; reopened as is, since a new start ends the old one. */
        const loginUrl = ref<string | null>(null);
        /** The page of the ChatGPT sign-in waiting in the browser; reopened as is, since a new start ends the old one. */
        const chatgptLoginUrl = ref<string | null>(null);
        /** When the person last signed in to a provider here, epoch ms; `null` before they have. */
        const signedInAt = ref<number | null>(null);
        const sandboxRefresh = createSingleRunner({ handler: refreshSandbox });
        let pollTimer: ReturnType<typeof setInterval> | undefined;

        const state = reactive({
            sandbox: computed(() => sandbox.value),
            ai: computed(() => ai.value),
            aiError: computed(() => aiError.value),
            /**
             * The last sign-in finished in this app session; screens showing the account read it before `ai`, which
             * after an app restart is the only source.
             */
            signIn: computed(() => signIn.value),
            loginUrl: computed(() => loginUrl.value),
            chatgptLoginUrl: computed(() => chatgptLoginUrl.value),
            /**
             * When the person last finished signing in to a provider in this app, epoch ms (this machine's clock);
             * `null` before they have. Only a sign-in counts: the daemon may still count the provider as connected after
             * the agent was signed out.
             */
            signedInAt: computed(() => signedInAt.value),
            /**
             * The first run is done as far as the app last knew: the sandbox ready (as last polled) and the active
             * provider connected on an allowed plan (as last asked, or as the sign-in answered). Lets ordinary navigation
             * skip asking the provider again; a sandbox that stops being ready forgets the provider's status, so it is
             * asked again after.
             */
            done: computed(
                () => sandbox.value?.status === 'ready' && ai.value?.connected === true && ai.value.planAllowed,
            ),
        });

        return {
            state,
            pollSandbox,
            getProgress,
            startSandbox,
            startLogin,
            completeLogin,
            startChatgptLogin,
            getChatgptLoginState,
            cancelChatgptLogin,
        };

        /** Starts polling the sandbox's status; once, however often it is called. */
        function pollSandbox() {
            pollTimer ??= setInterval(() => void sandboxRefresh.execute(), SANDBOX_POLL_INTERVAL_MS);
        }

        /** Asks the daemon where the first run stands. A daemon that does not answer counts as a sandbox not ready. */
        async function getProgress(): Promise<SetupProgress> {
            await sandboxRefresh.execute();
            if (sandbox.value?.status !== 'ready') {
                return 'sandboxNotReady';
            }

            try {
                ai.value = await daemon(AiStatusGetEndpoint);
                aiError.value = null;
            } catch (error) {
                ai.value = null;
                // An error answer other than 409 `SandboxNotReady` (the sandbox stopped being ready since it was
                // asked): the check itself failed, and the person sees why. No answer at all: the daemon is gone.
                if (error instanceof HttpError && error.status !== 409) {
                    aiError.value = error.message;
                    return 'aiStatusFailed';
                }
                return 'sandboxNotReady';
            }

            if (!ai.value.connected) {
                return 'aiNotConnected';
            }
            // Only Claude reports a plan the agent may not run on; ChatGPT's sign-in carries no plan.
            return ai.value.planAllowed ? 'done' : 'aiPlanNotAllowed';
        }

        /** Starts the sandbox, or retries a failed start. */
        async function startSandbox() {
            setSandbox(await daemon(SandboxStartEndpoint));
        }

        /** Starts a new Claude sign-in (ending one already waiting) and returns its page. */
        async function startLogin() {
            const { url } = await daemon(ClaudeLoginStartEndpoint);
            loginUrl.value = url;
            return url;
        }

        /** Gives the waiting sign-in the pasted code; on `codeRejected` the sign-in's page is the one it returns. */
        async function completeLogin(code: string): Promise<ClaudeLoginResult> {
            const result = await daemon(ClaudeLoginCompleteEndpoint, { code });
            switch (result.outcome) {
                case 'codeRejected':
                    loginUrl.value = result.url;
                    break;
                case 'expired':
                    loginUrl.value = null;
                    break;
                case 'connected':
                case 'planNotAllowed':
                    loginUrl.value = null;
                    signedInAt.value = Date.now();
                    signIn.value = { provider: 'claude', email: result.email, plan: result.plan };
                    ai.value = {
                        connected: true,
                        provider: 'claude',
                        email: result.email,
                        plan: result.plan,
                        planAllowed: result.outcome === 'connected',
                    };
                    break;
                default:
                    assertNever(result);
            }
            return result;
        }

        /** Starts a new ChatGPT sign-in (ending one already waiting) and returns its page. */
        async function startChatgptLogin() {
            const { url } = await daemon(ChatgptLoginStartEndpoint);
            chatgptLoginUrl.value = url;
            return url;
        }

        /** Asks where the ChatGPT sign-in stands; once connected, ChatGPT is the active provider. */
        async function getChatgptLoginState(): Promise<ChatgptLoginState> {
            const result = await daemon(ChatgptLoginStateGetEndpoint);
            switch (result.state) {
                case 'pending':
                    chatgptLoginUrl.value = result.url;
                    break;
                case 'failed':
                case 'expired':
                    chatgptLoginUrl.value = null;
                    break;
                case 'connected':
                    chatgptLoginUrl.value = null;
                    signedInAt.value = Date.now();
                    signIn.value = { provider: 'chatgpt', email: null, plan: null };
                    ai.value = { connected: true, provider: 'chatgpt', email: null, plan: null, planAllowed: true };
                    break;
                default:
                    assertNever(result);
            }
            return result;
        }

        /** Ends the waiting ChatGPT sign-in, if any. */
        async function cancelChatgptLogin() {
            chatgptLoginUrl.value = null;
            await daemon(ChatgptLoginCancelEndpoint);
        }

        async function refreshSandbox() {
            try {
                setSandbox(await daemon(SandboxStatusGetEndpoint));
            } catch {
                setSandbox(null);
            }
        }

        function setSandbox(status: SandboxStatus | null) {
            sandbox.value = status;
            if (status?.status !== 'ready') {
                ai.value = null;
            }
        }
    },
});
