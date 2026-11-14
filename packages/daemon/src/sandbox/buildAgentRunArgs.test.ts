import { expect, test } from 'bun:test';

import { buildAgentRunArgs } from './buildAgentRunArgs.js';

const IMAGE = 'poweragents-agent:abc';
const { args: ARGS } = buildAgentRunArgs(IMAGE);

test('publishes the agent on the loopback only', () => {
    const published = ARGS.flatMap((arg, index) => (isPublishFlag(arg) ? [ARGS[index + 1]] : []));

    expect(published).toEqual(['127.0.0.1:47611:4096']);
    expect(ARGS.some(arg => arg.startsWith('--publish=') || arg === '--network=host' || arg === 'host')).toBe(false);
});

test('mounts the data root and the two state volumes, and nothing else', () => {
    const volumes = ARGS.flatMap((arg, index) => (arg === '--volume' || arg === '-v' ? [ARGS[index + 1]] : []));

    expect(volumes).toEqual([
        '/Poweragents:/Poweragents',
        'poweragents-claude:/root/.claude',
        'poweragents-opencode:/root/.local/share/opencode',
    ]);
    expect(ARGS.some(arg => arg.startsWith('--volume=') || arg.startsWith('--mount'))).toBe(false);
});

test('takes the password from the env file, never from the arguments', () => {
    expect(ARGS.slice(ARGS.indexOf('--env-file'), ARGS.indexOf('--env-file') + 2)).toEqual([
        '--env-file',
        '/dev/stdin',
    ]);
    expect(ARGS.some(arg => arg.includes('OPENCODE_SERVER_PASSWORD'))).toBe(false);
});

test('runs OpenCode in the mode that keeps the password out of its children, with stdin held open', () => {
    expect(ARGS).toContain('--interactive');
    expect(ARGS).toContain('--tty');
    expect(ARGS.slice(ARGS.indexOf(IMAGE) + 1, ARGS.indexOf(IMAGE) + 4)).toEqual(['opencode', 'serve', '--stdio']);
});

test('tells the agent where the browser tunnel is, without its token', () => {
    const envs = ARGS.flatMap((arg, index) => (arg === '--env' ? [ARGS[index + 1]] : []));

    expect(envs).toContain('POWERAGENTS_BROWSER_URL=ws://192.168.5.2:47612');
    expect(ARGS.some(arg => arg.includes('POWERAGENTS_BROWSER_TOKEN'))).toBe(false);
});

test('labels the container with a spec that changes with the image', () => {
    const run = buildAgentRunArgs(IMAGE);
    const other = buildAgentRunArgs('poweragents-agent:def');

    expect(run.args.slice(0, 3)).toEqual(['run', '--label', `poweragents.spec=${run.spec}`]);
    expect(buildAgentRunArgs(IMAGE).spec).toBe(run.spec);
    expect(other.spec).not.toBe(run.spec);
});

function isPublishFlag(arg: string) {
    return arg === '--publish' || arg === '-p';
}
