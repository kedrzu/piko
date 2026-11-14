import path from 'node:path';

import { BROWSER_TUNNEL_PORT, DAEMON_FOLDER, PROJECTS_FOLDER, SANDBOX_API_PORT } from '../env.js';

/** The `nerdctl run` arguments of the agent's container, and the spec they carry. */
export interface AgentRunArgs {
    args: string[];
    /**
     * A hash of everything else in `args`, set as the container's `poweragents.spec` label: a running container with
     * the same spec runs the same image with the same options, so it can be reused instead of recreated.
     */
    spec: string;
}

/** The container label holding `AgentRunArgs.spec`. */
export const AGENT_SPEC_LABEL = 'poweragents.spec';
/** The agent's container. */
export const AGENT_CONTAINER = 'poweragents-agent';
/** The profile's data root in the VM, mounted at the same path in the container and its working directory. */
export const AGENT_DATA_ROOT = '/Poweragents';
/** The projects' folder as the agent sees it. */
export const AGENT_PROJECTS_DIR = path.posix.join(AGENT_DATA_ROOT, PROJECTS_FOLDER);
/** The daemon's folder as the agent sees it: mounted read-only over the writable data root. */
export const AGENT_DAEMON_DIR = path.posix.join(AGENT_DATA_ROOT, DAEMON_FOLDER);
/** The skill copies the agent loads; the global `opencode.json` of `agent.Containerfile` names the same folder. */
export const AGENT_SKILLS_DIR = path.posix.join(AGENT_DAEMON_DIR, 'skills');
/**
 * The plugins' environment as the agent sees it, on the `poweragents-env` volume: Node packages in `node/`, a Python venv
 * in `python/`. The image's `PATH` (`agent.Containerfile`) leads with their bin folders.
 */
export const AGENT_ENV_DIR = '/opt/poweragents/env';
/** The port the agent is published on, on the VM's loopback (Lima forwards it to the host's), next to the daemon's. */
export const AGENT_HOST_PORT = 47611;

/** The host as the VM sees it (`host.lima.internal`): Lima's user-mode network gateway, forwarding to the host. */
export const HOST_GATEWAY = '192.168.5.2';

/** The port OpenCode listens on inside the container. */
const OPENCODE_PORT = 4096;

/**
 * Builds the `nerdctl` arguments that start the agent's container: OpenCode serving on the loopback only, behind the
 * password nerdctl reads from its stdin (`OPENCODE_SERVER_PASSWORD=…`), with the addresses of the browser tunnel (its
 * token comes the same way, `POWERAGENTS_BROWSER_TOKEN=…`) and of the daemon's sandbox API. It mounts the profile's data
 * root, the daemon's folder in it a second time read-only (the later mount shadows the writable one, so the agent reads
 * the plugin copies and the manifest but cannot change them), and three named volumes: Claude's login, OpenCode's
 * conversations and the plugins' environment, kept across container recreation. The secrets never appear in the
 * arguments, which other processes can read.
 * @__NO_SIDE_EFFECTS__
 */
export function buildAgentRunArgs(image: string): AgentRunArgs {
    const options = [
        '--detach',
        '--name',
        AGENT_CONTAINER,
        '--publish',
        `127.0.0.1:${AGENT_HOST_PORT}:${OPENCODE_PORT}`,
        '--volume',
        `${AGENT_DATA_ROOT}:${AGENT_DATA_ROOT}`,
        '--volume',
        `${AGENT_DAEMON_DIR}:${AGENT_DAEMON_DIR}:ro`,
        '--volume',
        'poweragents-claude:/root/.claude',
        '--volume',
        'poweragents-opencode:/root/.local/share/opencode',
        '--volume',
        `poweragents-env:${AGENT_ENV_DIR}`,
        '--env',
        'CLAUDE_CONFIG_DIR=/root/.claude',
        '--env',
        `POWERAGENTS_BROWSER_URL=ws://${HOST_GATEWAY}:${BROWSER_TUNNEL_PORT}`,
        '--env',
        `POWERAGENTS_DAEMON_URL=http://${HOST_GATEWAY}:${SANDBOX_API_PORT}`,
        '--env-file',
        '/dev/stdin',
        '--workdir',
        AGENT_DATA_ROOT,
        image,
        'opencode',
        'serve',
        '--hostname',
        '0.0.0.0',
        '--port',
        String(OPENCODE_PORT),
    ];
    const spec = new Bun.CryptoHasher('sha256').update(options.join('\0')).digest('hex').slice(0, 16);

    return { args: ['run', '--label', `${AGENT_SPEC_LABEL}=${spec}`, ...options], spec };
}
