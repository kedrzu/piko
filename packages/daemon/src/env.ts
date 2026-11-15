import os from 'node:os';
import path from 'node:path';

import { defineEnvVariable } from '@nzyme/ioc/defineEnvVariable.js';

/**
 * The unpacked Lima release the sandbox runs (`bin/limactl` inside). The desktop app passes the copy bundled in its
 * resources; the default, resolved against the daemon's source, is the copy `scripts/fetchLima.ts` downloads for
 * development and does not exist inside a compiled daemon.
 */
export const POWERAGENTS_LIMA_DIR = defineEnvVariable('POWERAGENTS_LIMA_DIR', {
    default: () => path.resolve(import.meta.dirname, '../vendor/lima'),
});

/**
 * The plugins that ship with the app (design D36), one folder each. The desktop app passes the copy bundled in its
 * resources; the default, resolved against the daemon's source, is `packages/daemon/plugins` and does not exist inside a
 * compiled daemon.
 */
export const POWERAGENTS_PLUGINS_DIR = defineEnvVariable('POWERAGENTS_PLUGINS_DIR', {
    default: () => path.resolve(import.meta.dirname, '../plugins'),
});

/**
 * The profile's data root: the projects (`PROJECTS_FOLDER`) and the Memory (`MEMORY_FOLDER`), and the only folder of the
 * computer the sandbox mounts. Set in tests and development to keep a real profile untouched.
 */
export const POWERAGENTS_DATA_ROOT = defineEnvVariable('POWERAGENTS_DATA_ROOT', {
    default: () => path.join(os.homedir(), 'Poweragents'),
});

/**
 * Lima's home (`LIMA_HOME`): the sandbox's VM, its disk and volumes. The daemon keeps its own state (the agent's
 * password) and its log (`logs/daemon.log`) in the folder above it, so a test pointing this at a scratch folder leaves
 * the real VM, its state and its log untouched. Keep the path short: Lima's unix sockets live under it, and macOS caps a
 * socket path at 104 bytes.
 */
export const POWERAGENTS_LIMA_HOME = defineEnvVariable('POWERAGENTS_LIMA_HOME', {
    default: () => path.join(os.homedir(), '.poweragents', 'lima'),
});

/** The data root's folder holding every project's folder. */
export const PROJECTS_FOLDER = 'projects';

/** The data root's folder holding the Memory: plain files about the person, read and written by the agent (design D9). */
export const MEMORY_FOLDER = 'memory';

/** The data root's folder holding the person's own plugins, one folder each, installed by being there (design D40). */
export const PLUGINS_FOLDER = 'plugins';

/** The data root's folder the daemon keeps its own files in, which the agent can read but not change. */
export const DAEMON_FOLDER = '.poweragents';

/** The data root's folder the agent's browser saves downloads to, so the agent in the sandbox can read them. */
export const DOWNLOADS_FOLDER = 'downloads';

/** The loopback port of the tunnel that carries the sandbox's DevTools connection to the agent's browser. */
export const BROWSER_TUNNEL_PORT = 47612;

/** The loopback port of the proxy the agent's browser sends its traffic through. */
export const BROWSER_PROXY_PORT = 47613;

/** The loopback port of the daemon's API for the sandbox: what the agent's tools call (`POWERAGENTS_DAEMON_URL`). */
export const SANDBOX_API_PORT = 47614;

/**
 * The version of the app that started this daemon, reported on `/status` so the desktop app can tell a daemon left over
 * from before an update. Unset for a daemon run from a worktree in development, which the app never replaces.
 */
export const POWERAGENTS_VERSION = defineEnvVariable('POWERAGENTS_VERSION', { required: false });
