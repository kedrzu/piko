/**
 * Where the agent's sandbox is, as the daemon's API reports it. Starting walks `startingVm → buildingImage →
 * startingAgent → ready` (`buildingImage` only when the environment is first downloaded or changed); the starting
 * states carry `progress` once the daemon has planned the start's steps. `failed` carries a technical message for the
 * details view, and `sandbox/start` retries.
 */
export type SandboxStatus =
    | { status: 'stopped' }
    | { status: 'startingVm'; progress?: SandboxStartProgress }
    | { status: 'buildingImage'; progress?: SandboxStartProgress }
    | { status: 'startingAgent'; progress?: SandboxStartProgress }
    | { status: 'ready' }
    | { status: 'stopping' }
    | { status: 'failed'; message: string };

/**
 * How far a sandbox start has come, for the progress bar. `fraction` (0–1) only ever grows and reaches 1 only when the
 * start finishes; `remainingMs` is the current estimate of the time left, never negative.
 */
export interface SandboxStartProgress {
    fraction: number;
    remainingMs: number;
}
