import { expect, jest, test } from 'bun:test';

import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';
import { createPromise } from '@nzyme/utils/createPromise.js';

import type { PluginEnvironmentError } from '@poweragents/common/api/PluginTypes.js';

import { Sandbox } from '../sandbox/Sandbox.js';
import type { SandboxProcess, SandboxState } from '../sandbox/Sandbox.js';
import { PluginEnvironment } from './PluginEnvironment.js';
import type { PluginEnvironmentApplyResult } from './PluginEnvironment.js';
import type { EnvironmentPlugin } from './utils/buildEnvironmentFiles.js';

// The sandbox is the boundary: a fake that records every command run in the container with what it got on stdin, and
// answers each with the exit code and output a test scripts. The files are rendered for real. Every command must come
// under `timeout`; the fake records it without that prefix.

const GMAIL: EnvironmentPlugin = {
    name: 'gmail',
    dir: '/Poweragents/.poweragents/plugins/gmail',
    environment: { cli: 'cli', npm: { 'left-pad': '1.3.0' }, python: { requests: '2.31.0' } },
};
const NOTES: EnvironmentPlugin = {
    name: 'my-notes',
    dir: '/Poweragents/plugins/my-notes',
    environment: { npm: { chalk: '5.3.0' } },
};

test('installs the Node packages and syncs the venv from the rendered files, in the container', async () => {
    const { environment, calls } = setup();

    const result = await environment.apply([GMAIL, NOTES]);

    const expected: PluginEnvironmentApplyResult = { applied: true, errors: new Map() };
    expect(result).toEqual(expected);
    expect(calls).toEqual([
        { command: ['mkdir', '-p', '/opt/poweragents/env/node'], stdin: '' },
        {
            command: ['tee', '/opt/poweragents/env/node/package.json'],
            stdin: packageJson({
                '@poweragents-plugins/gmail': 'file:/Poweragents/.poweragents/plugins/gmail/cli',
                chalk: '5.3.0',
                'left-pad': '1.3.0',
            }),
        },
        { command: ['bun', 'install', '--cwd', '/opt/poweragents/env/node', '--backend=copyfile'], stdin: '' },
        {
            command: ['uv', 'venv', '--allow-existing', '--python', '/usr/bin/python3', '/opt/poweragents/env/python'],
            stdin: '',
        },
        { command: ['tee', '/opt/poweragents/env/requirements.in'], stdin: 'requests==2.31.0\n' },
        {
            command: [
                'uv',
                'pip',
                'compile',
                '/opt/poweragents/env/requirements.in',
                '--output-file',
                '/opt/poweragents/env/requirements.txt',
                '--python',
                '/opt/poweragents/env/python/bin/python',
                '--quiet',
            ],
            stdin: '',
        },
        {
            command: [
                'uv',
                'pip',
                'sync',
                '/opt/poweragents/env/requirements.txt',
                '--python',
                '/opt/poweragents/env/python/bin/python',
            ],
            stdin: '',
        },
    ]);
});

test('a plugin left out loses its packages: its CLI and pins leave package.json, and with no Python left the venv goes', async () => {
    const { environment, calls } = setup();
    await environment.apply([GMAIL, NOTES]);
    calls.length = 0;

    await environment.apply([NOTES]);

    expect(calls).toEqual([
        { command: ['mkdir', '-p', '/opt/poweragents/env/node'], stdin: '' },
        { command: ['tee', '/opt/poweragents/env/node/package.json'], stdin: packageJson({ chalk: '5.3.0' }) },
        { command: ['bun', 'install', '--cwd', '/opt/poweragents/env/node', '--backend=copyfile'], stdin: '' },
        {
            command: [
                'rm',
                '-rf',
                '/opt/poweragents/env/python',
                '/opt/poweragents/env/requirements.in',
                '/opt/poweragents/env/requirements.txt',
            ],
            stdin: '',
        },
    ]);
});

test('applying the same plugins again writes the same files and runs the same commands', async () => {
    const { environment, calls } = setup();
    await environment.apply([GMAIL, NOTES]);
    const first = calls.splice(0);

    await environment.apply([NOTES, GMAIL]);

    expect(calls).toEqual(first);
});

test('a failed step is an error on the plugins of its part only, with the end of the output; a good apply clears it', async () => {
    const { environment, respond } = setup();
    respond.set('bun install', {
        exitCode: 1,
        stderr: `${'x'.repeat(10_000)}\nerror: left-pad@1.3.0 failed to resolve`,
    });

    const failed = await environment.apply([GMAIL, NOTES]);

    assertApplied(failed);
    expect([...failed.errors.keys()].toSorted()).toEqual(['gmail', 'my-notes']);
    const error = failed.errors.get('gmail');
    expect(error).toMatchObject({ code: 'applyFailed', part: 'npm', exitCode: 1 });
    // Bounded: the end of the output, where the reason is.
    expect(error?.code === 'applyFailed' && error.output.length).toBeLessThanOrEqual(4000);
    expect(error?.code === 'applyFailed' && error.output.endsWith('error: left-pad@1.3.0 failed to resolve')).toBe(
        true,
    );
    expect(environment.getErrors()).toEqual(failed.errors);

    respond.clear();
    const retried = await environment.apply([GMAIL, NOTES]);

    expect(retried).toEqual({ applied: true, errors: new Map() });
    expect(environment.getErrors().size).toBe(0);
});

test('a conflicting plugin gets its conflict error and the others apply', async () => {
    const { environment, calls } = setup();
    const rival: EnvironmentPlugin = {
        name: 'zeta',
        dir: '/Poweragents/plugins/zeta',
        environment: { npm: { chalk: '4.0.0' } },
    };

    const result = await environment.apply([rival, NOTES]);

    const conflict: PluginEnvironmentError = { code: 'conflict', part: 'npm', package: 'chalk', plugin: 'my-notes' };
    expect(result).toEqual({ applied: true, errors: new Map([['zeta', conflict]]) });
    expect(calls[1]?.stdin).toBe(packageJson({ chalk: '5.3.0' }));
});

test('nothing runs while the sandbox is not ready, and the last errors stay', async () => {
    const { environment, respond, calls, state } = setup();
    respond.set('bun install', { exitCode: 1, stderr: 'offline' });
    await environment.apply([NOTES]);
    calls.length = 0;
    state.current = { status: 'startingVm' };

    const result = await environment.apply([NOTES]);

    expect(result).toEqual({ applied: false });
    expect(calls).toEqual([]);
    expect([...environment.getErrors().keys()]).toEqual(['my-notes']);
});

test('a sandbox stopping mid-apply is no error on the plugins', async () => {
    const { environment, respond, state } = setup();
    respond.set('bun install', { stopsSandbox: true });

    const result = await environment.apply([NOTES]);

    expect(result).toEqual({ applied: false });
    expect(state.current.status).toBe('stopping');
    expect(environment.getErrors().size).toBe(0);
});

test('applies asked for during one run become one more run with the last plugins, which they all get', async () => {
    const { environment, calls, respond } = setup();
    const gate = createPromise();
    respond.set('bun install', { exitCode: 0, waitFor: gate.promise });

    const first = environment.apply([GMAIL]);
    await Bun.sleep(0);
    const second = environment.apply([GMAIL, NOTES]);
    const third = environment.apply([NOTES]);
    expect(calls.filter(call => call.command[0] === 'tee')).toHaveLength(1);

    respond.clear();
    gate.resolve();
    const results = await Promise.all([first, second, third]);

    const written = calls.filter(call => call.command[1] === '/opt/poweragents/env/node/package.json');
    expect(written.map(call => call.stdin)).toEqual([
        packageJson({
            '@poweragents-plugins/gmail': 'file:/Poweragents/.poweragents/plugins/gmail/cli',
            'left-pad': '1.3.0',
        }),
        packageJson({ chalk: '5.3.0' }),
    ]);
    expect(results[1]).toBe(results[2]);
});

test('a hung step is killed at its deadline and fails with what it printed, and the next apply runs', async () => {
    jest.useFakeTimers();
    try {
        const { environment, calls, respond, killed } = setup();
        respond.set('bun install', { hangs: true, stderr: 'Resolving dependencies' });

        const first = environment.apply([NOTES]);
        const second = environment.apply([]);
        while (!calls.some(call => call.command[0] === 'bun')) {
            await Promise.resolve();
        }
        jest.advanceTimersByTime(630_000);
        const failed = await first;

        const error: PluginEnvironmentError = {
            code: 'applyFailed',
            part: 'npm',
            exitCode: null,
            output: 'Resolving dependencies\nTimed out after 600 s.',
        };
        expect(failed).toEqual({ applied: true, errors: new Map([['my-notes', error]]) });
        expect(killed).toEqual([['bun', 'install', '--cwd', '/opt/poweragents/env/node', '--backend=copyfile']]);

        // The queued apply runs: its `bun install` hangs too, and its plugins (none) get no error.
        while (calls.filter(call => call.command[0] === 'bun').length < 2) {
            await Promise.resolve();
        }
        jest.advanceTimersByTime(630_000);
        expect(await second).toEqual({ applied: true, errors: new Map() });
    } finally {
        jest.useRealTimers();
    }
});

test("a step's own timeout is reported as one", async () => {
    const { environment, respond } = setup();
    respond.set('uv pip', { exitCode: 124, stderr: 'Downloading numpy' });

    const result = await environment.apply([GMAIL]);

    const error: PluginEnvironmentError = {
        code: 'applyFailed',
        part: 'python',
        exitCode: 124,
        output: 'Downloading numpy\nTimed out after 600 s.',
    };
    expect(result).toEqual({ applied: true, errors: new Map([['gmail', error]]) });
});

interface StepResponse {
    exitCode?: number;
    stderr?: string;
    /** The command ends only once this resolves. */
    waitFor?: Promise<void>;
    /** The sandbox stops while the command runs, which then fails. */
    stopsSandbox?: boolean;
    /** The command prints its `stderr` and then never ends, nor does its output, until killed. */
    hangs?: boolean;
}

interface ExecCall {
    command: string[];
    stdin: string;
}

function setup() {
    const { container } = createTestContainer();
    const state: { current: SandboxState } = {
        current: { status: 'ready', endpoint: { url: 'http://127.0.0.1:1', username: 'u', password: 'p' } },
    };
    const calls: ExecCall[] = [];
    // Keyed by the command's first two words.
    const respond = new Map<string, StepResponse>();
    const killed: string[][] = [];
    container.set(Sandbox, {
        getState: () => state.current,
        getVerifiedState: () => Promise.resolve(state.current),
        stateChanged: createEventEmitter<[state: SandboxState]>().event,
        start: () => Promise.reject(new Error('not used')),
        stop: () => Promise.resolve(),
        notifySkillsChanged: () => Promise.resolve(),
        exec: ({ command: timed }): SandboxProcess => {
            if (state.current.status !== 'ready') {
                throw new Error(`Sandbox is not ready: ${state.current.status}`);
            }
            expect(timed.slice(0, 3)).toEqual(['timeout', '--kill-after=10s', '600s']);
            const command = timed.slice(3);
            const call: ExecCall = { command, stdin: '' };
            calls.push(call);
            const response = respond.get(command.slice(0, 2).join(' ')) ?? {};
            if (response.stopsSandbox) {
                state.current = { status: 'stopping' };
            }
            return {
                stdin: {
                    write: chunk => {
                        call.stdin += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
                    },
                    end: () => undefined,
                },
                stdout: new Blob([]).stream(),
                stderr: response.hangs
                    ? new ReadableStream<Uint8Array>({
                          start: controller => controller.enqueue(new TextEncoder().encode(response.stderr ?? '')),
                      })
                    : new Blob([response.stderr ?? '']).stream(),
                exited: response.hangs
                    ? new Promise<number>(() => {})
                    : (async () => {
                          await response.waitFor;
                          return response.stopsSandbox ? 137 : (response.exitCode ?? 0);
                      })(),
                kill: () => killed.push(command),
            };
        },
    });
    return { environment: container.resolve(PluginEnvironment), calls, respond, state, killed };
}

function packageJson(dependencies: Record<string, string>) {
    return `${JSON.stringify({ private: true, dependencies }, null, 4)}\n`;
}

function assertApplied(
    result: PluginEnvironmentApplyResult,
): asserts result is Extract<PluginEnvironmentApplyResult, { applied: true }> {
    expect(result.applied).toBe(true);
}
