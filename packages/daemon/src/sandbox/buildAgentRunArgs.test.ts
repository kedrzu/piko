import { expect, test } from 'bun:test';

import AGENT_CONTAINERFILE from '../../sandbox/agent.Containerfile' with { type: 'text' };
import { AGENT_SKILLS_DIR, buildAgentRunArgs } from './buildAgentRunArgs.js';

const IMAGE = 'piko-agent:abc';
const { args: ARGS } = buildAgentRunArgs(IMAGE);

test('publishes the agent on the loopback only', () => {
    const published = ARGS.flatMap((arg, index) => (isPublishFlag(arg) ? [ARGS[index + 1]] : []));

    expect(published).toEqual(['127.0.0.1:47611:4096']);
    expect(ARGS.some(arg => arg.startsWith('--publish=') || arg === '--network=host' || arg === 'host')).toBe(false);
});

test("mounts the data root, the daemon's folder read-only over it and the three state volumes, and nothing else", () => {
    const volumes = ARGS.flatMap((arg, index) => (arg === '--volume' || arg === '-v' ? [ARGS[index + 1]] : []));

    // The read-only mount comes after the data root's, so it shadows the writable one at exactly the same path.
    expect(volumes).toEqual([
        '/Piko:/Piko',
        '/Piko/.piko:/Piko/.piko:ro',
        'piko-claude:/root/.claude',
        'piko-opencode:/root/.local/share/opencode',
        'piko-env:/opt/piko/env',
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

    expect(envs).toContain('PIKO_BROWSER_URL=ws://192.168.5.2:47612');
    expect(ARGS.some(arg => arg.includes('PIKO_BROWSER_TOKEN'))).toBe(false);
});

test("tells the agent where the daemon's sandbox API is", () => {
    const envs = ARGS.flatMap((arg, index) => (arg === '--env' ? [ARGS[index + 1]] : []));

    expect(envs).toContain('PIKO_DAEMON_URL=http://192.168.5.2:47614');
});

test('labels the container with a spec that changes with the image', () => {
    const run = buildAgentRunArgs(IMAGE);
    const other = buildAgentRunArgs('piko-agent:def');

    expect(run.args.slice(0, 3)).toEqual(['run', '--label', `piko.spec=${run.spec}`]);
    expect(buildAgentRunArgs(IMAGE).spec).toBe(run.spec);
    expect(other.spec).not.toBe(run.spec);
});

test("points OpenCode's global skills at the folder the daemon copies the plugins' skills into", () => {
    const opencodeJson = /^COPY <<EOF \/root\/\.config\/opencode\/opencode\.json\n([\s\S]*?)\nEOF$/m.exec(
        AGENT_CONTAINERFILE,
    );

    const config: unknown = JSON.parse(opencodeJson?.[1] ?? 'null');
    expect(config).toMatchObject({ skills: [AGENT_SKILLS_DIR] });
});

function isPublishFlag(arg: string) {
    return arg === '--publish' || arg === '-p';
}
