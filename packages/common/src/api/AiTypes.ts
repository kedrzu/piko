/** The AI providers the agent can run on. */
export type AiProvider = 'claude' | 'chatgpt';

/**
 * The active provider's sign-in, which decides whether the agent can work. `provider` is `null` only when no provider
 * is active and none is connected: the app asks the person to choose one.
 */
export type AiStatus =
    | { connected: false; provider: AiProvider | null }
    | {
          connected: true;
          provider: AiProvider;
          /** `null` when the provider reports none (a ChatGPT sign-in never does). */
          email: string | null;
          /** The plan as the provider names it; `null` when it reports none. */
          plan: string | null;
          /** Whether the agent may run on `plan`; it works only when it may. */
          planAllowed: boolean;
      };
