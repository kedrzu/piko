import path from 'node:path';

import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';

import type { PluginEnvironmentError, PluginEnvironmentPart } from '@poweragents/common/api/PluginTypes.js';

import { AGENT_ENV_DIR } from '../sandbox/buildAgentRunArgs.js';
import { Sandbox } from '../sandbox/Sandbox.js';
import { buildEnvironmentFiles } from './utils/buildEnvironmentFiles.js';
import type { EnvironmentPlugin } from './utils/buildEnvironmentFiles.js';

/** How an apply ended: not run, as the sandbox is not ready (it runs at the next `ready`), or run, with its errors. */
export type PluginEnvironmentApplyResult =
    | { applied: false }
    | { applied: true; errors: ReadonlyMap<string, PluginEnvironmentError> };

/**
 * The plugins' environment in the agent's container (`AGENT_ENV_DIR`): Node packages installed by Bun and a Python venv
 * synced by uv, built only from the plugins given, so a plugin left out loses its packages. Both tools are idempotent:
 * applying the same plugins again changes nothing, and an apply never caches what it did.
 */
export interface PluginEnvironmentShape {
    /**
     * Makes the environment hold exactly what `plugins` add. One apply runs at a time; applies asked for while one runs
     * become one more run, with the plugins of the last ask, which they all resolve with. Never rejects: a failure is in
     * the result and in `getErrors()`.
     */
    apply(plugins: EnvironmentPlugin[]): Promise<PluginEnvironmentApplyResult>;
    /** The errors of the last apply that ran, by plugin name; a successful apply clears them. */
    getErrors(): ReadonlyMap<string, PluginEnvironmentError>;
}

/** A command run in the agent's container, with what it reads on stdin. */
interface Step {
    command: string[];
    stdin?: string;
}

/** The run asked for while one runs: the plugins of the last ask, and the promise every ask since waits on. */
interface QueuedApply {
    plugins: EnvironmentPlugin[];
    done: PromiseWithResolvers<PluginEnvironmentApplyResult>;
}

/** Why a step failed: its exit code (`null` when it could not run) and the end of its output. */
interface StepFailure {
    exitCode: number | null;
    output: string;
}

const NODE_DIR = path.posix.join(AGENT_ENV_DIR, 'node');
const PYTHON_DIR = path.posix.join(AGENT_ENV_DIR, 'python');
const PYTHON_BIN = path.posix.join(PYTHON_DIR, 'bin', 'python');
const REQUIREMENTS_IN = path.posix.join(AGENT_ENV_DIR, 'requirements.in');
const REQUIREMENTS_TXT = path.posix.join(AGENT_ENV_DIR, 'requirements.txt');
/** Debian's Python in the image: the venv never waits on uv downloading another one. */
const SYSTEM_PYTHON = '/usr/bin/python3';
/** How much of each output stream a failure keeps: the end, where the tools print what went wrong. */
const OUTPUT_TAIL_BYTES = 4000;
/** How long a step may run: a slow `bun install` or `uv pip sync` on a slow network, not a hung one. */
const STEP_TIMEOUT_S = 600;
/** How long after `STEP_TIMEOUT_S` `timeout` waits for the step to end before it kills it. */
const STEP_KILL_AFTER_S = 10;
/** When the host side of a step that has not ended is killed: after `timeout` had its chance in the container. */
const STEP_HOST_DEADLINE_MS = (STEP_TIMEOUT_S + STEP_KILL_AFTER_S + 20) * 1000;
/** The exit code of coreutils' `timeout` when the step timed out. */
const TIMEOUT_EXIT_CODE = 124;

/** Installs the plugins' CLIs, npm and Python packages into the agent's container. */
export const PluginEnvironment = defineService({
    name: 'PluginEnvironment',
    deps: { logger: Logger, sandbox: Sandbox },
    setup({ logger, sandbox }): PluginEnvironmentShape {
        let errors: ReadonlyMap<string, PluginEnvironmentError> = new Map();
        let running = false;
        let queued: QueuedApply | null = null;

        return { apply, getErrors };

        function apply(plugins: EnvironmentPlugin[]) {
            if (!running) {
                return start(plugins);
            }
            queued ??= { done: Promise.withResolvers<PluginEnvironmentApplyResult>(), plugins };
            queued.plugins = plugins;
            return queued.done.promise;
        }

        function getErrors() {
            return errors;
        }

        function start(plugins: EnvironmentPlugin[]) {
            running = true;
            const result = run(plugins);
            void result.then(startQueued, startQueued);
            return result;
        }

        function startQueued() {
            running = false;
            const next = queued;
            queued = null;
            if (next) {
                next.done.resolve(start(next.plugins));
            }
        }

        async function run(plugins: EnvironmentPlugin[]): Promise<PluginEnvironmentApplyResult> {
            if (sandbox.getState().status !== 'ready') {
                logger.debug('Sandbox not ready, plugin environment applied when it is');
                return { applied: false };
            }

            const startedAt = Date.now();
            const files = buildEnvironmentFiles(plugins);
            const failures: Record<PluginEnvironmentPart, StepFailure | null> = {
                npm: await runSteps([
                    { command: ['mkdir', '-p', NODE_DIR] },
                    // `tee` writes its stdin to the file: the content never passes through a shell.
                    { command: ['tee', path.posix.join(NODE_DIR, 'package.json')], stdin: files.packageJson },
                    // Copies, never hard links: a link into a plugin's folder would let a change there reach the
                    // installed CLI unseen, and Bun's `chmod` of its bins would change the plugin's own files.
                    { command: ['bun', 'install', '--cwd', NODE_DIR, '--backend=copyfile'] },
                ]),
                python: await runSteps(
                    files.requirements
                        ? [
                              { command: ['uv', 'venv', '--allow-existing', '--python', SYSTEM_PYTHON, PYTHON_DIR] },
                              { command: ['tee', REQUIREMENTS_IN], stdin: files.requirements },
                              // `pip sync` installs exactly the list it gets, without dependencies: resolve them first.
                              {
                                  command: [
                                      'uv',
                                      'pip',
                                      'compile',
                                      REQUIREMENTS_IN,
                                      '--output-file',
                                      REQUIREMENTS_TXT,
                                      '--python',
                                      PYTHON_BIN,
                                      '--quiet',
                                  ],
                              },
                              { command: ['uv', 'pip', 'sync', REQUIREMENTS_TXT, '--python', PYTHON_BIN] },
                          ]
                        : // No Python package: no venv either, so nothing a removed plugin installed stays.
                          [{ command: ['rm', '-rf', PYTHON_DIR, REQUIREMENTS_IN, REQUIREMENTS_TXT] }],
                ),
            };

            if ((failures.npm || failures.python) && sandbox.getState().status !== 'ready') {
                // The sandbox went down mid-apply: not the plugins' fault, and it runs again at the next `ready`.
                logger.info('Sandbox stopped during plugin environment apply');
                return { applied: false };
            }

            const next = new Map(files.conflicts);
            for (const part of ['npm', 'python'] as const) {
                const failure = failures[part];
                if (failure) {
                    for (const plugin of files.parts[part]) {
                        next.set(plugin, { code: 'applyFailed', part, ...failure });
                    }
                }
            }
            errors = next;
            logger.info('Plugin environment applied', {
                npmPluginCount: files.parts.npm.length,
                pythonPluginCount: files.parts.python.length,
                conflictCount: files.conflicts.size,
                npmFailed: failures.npm != null,
                pythonFailed: failures.python != null,
                durationMs: Date.now() - startedAt,
            });
            return { applied: true, errors: next };
        }

        /** Runs `steps` in order, up to the first that fails, which is returned. */
        async function runSteps(steps: Step[]) {
            for (const step of steps) {
                const failure = await runStep(step);
                if (failure) {
                    return failure;
                }
            }
            return null;
        }

        /**
         * Runs a step under coreutils' `timeout`, which ends it inside the container (killing the host side alone would
         * leave it running there). Should the host side still not end, it is killed a while after, and the step fails
         * with what it printed so far.
         */
        async function runStep(step: Step): Promise<StepFailure | null> {
            const program = step.command.slice(0, 2).join(' ');
            try {
                const child = sandbox.exec({
                    command: ['timeout', `--kill-after=${STEP_KILL_AFTER_S}s`, `${STEP_TIMEOUT_S}s`, ...step.command],
                });
                if (step.stdin != null) {
                    child.stdin.write(step.stdin);
                }
                child.stdin.end();
                const stdout = collectTail(child.stdout);
                const stderr = collectTail(child.stderr);
                const ended = Promise.all([stdout.done, stderr.done, child.exited]).then(([, , exitCode]) => exitCode);
                // Observed by the race below; once the deadline won it, a later failure has nobody to tell.
                ended.catch(() => undefined);
                let timer: ReturnType<typeof setTimeout> | undefined;
                const exitCode = await Promise.race([
                    ended,
                    new Promise<null>(resolve => {
                        timer = setTimeout(() => resolve(null), STEP_HOST_DEADLINE_MS);
                    }),
                ]);
                clearTimeout(timer);
                if (exitCode === 0) {
                    return null;
                }
                if (exitCode === null) {
                    child.kill();
                }
                const timedOut = exitCode === null || exitCode === TIMEOUT_EXIT_CODE;
                logger.warn('Plugin environment step failed', { program, exitCode, timedOut });
                const output = [stdout.text(), stderr.text(), timedOut ? `Timed out after ${STEP_TIMEOUT_S} s.` : '']
                    .filter(text => text.length > 0)
                    .join('\n');
                return { exitCode, output };
            } catch (error) {
                logger.warn('Plugin environment step could not run', { program, error });
                return { exitCode: null, output: error instanceof Error ? error.message : String(error) };
            }
        }
    },
});

/**
 * Reads a stream to its end, keeping its last `OUTPUT_TAIL_BYTES` (and no more than one chunk beyond); `text()` gives
 * what was kept so far, also before the end.
 */
function collectTail(stream: ReadableStream<Uint8Array>) {
    const chunks: Uint8Array[] = [];
    let size = 0;
    const done = read();
    return { done, text };

    async function read() {
        for await (const chunk of stream) {
            chunks.push(chunk);
            size += chunk.length;
            while (chunks.length > 1 && size - (chunks[0]?.length ?? 0) >= OUTPUT_TAIL_BYTES) {
                size -= chunks.shift()?.length ?? 0;
            }
        }
    }

    function text() {
        return Buffer.concat(chunks).subarray(-OUTPUT_TAIL_BYTES).toString('utf8').trim();
    }
}
