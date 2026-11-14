#!/usr/bin/env bun
// @ts-check
// The `poweragents` command inside the agent's container: the agent manages its plugins through the daemon's sandbox
// API (`SandboxApiService`). It runs alone in the image, under the image's Bun, so it imports nothing; the daemon
// embeds it in the Containerfile at `/usr/local/bin/poweragents` (`buildAgentContainerfile`). What it prints is read
// by the model: short plain text.

/**
 * @typedef {{ code: 'conflict'; part: string; package: string; plugin: string }
 *     | { code: 'applyFailed'; part: string; exitCode: number | null; output: string }} EnvironmentError
 * @typedef {{
 *     name: string;
 *     source: 'bundled' | 'own';
 *     level?: 'profile' | 'project';
 *     title?: string;
 *     description?: string;
 *     installed: boolean;
 *     errors?: { code: string }[];
 *     environmentError?: EnvironmentError;
 * }} Plugin
 * @typedef {{
 *     plugin: string;
 *     source: 'bundled' | 'own';
 *     level: 'profile' | 'project';
 *     projectName?: string;
 *     added: boolean;
 *     onboardingSkill?: string;
 *     environmentError?: EnvironmentError;
 * }} InstallResult
 * @typedef {{ plugin: string; level: 'profile' | 'project'; projectName?: string }} RemoveResult
 * @typedef {{ url: string; token: string; session: string }} Connection
 */

const USAGE = `Usage:
  poweragents plugin list              the plugins you have here and the ones you can install
  poweragents plugin install <name>    install a plugin (a project plugin goes into this conversation's project)
  poweragents plugin remove <name>     remove a plugin you installed`;

process.exitCode = await main(process.argv.slice(2));

/**
 * @param {string[]} args
 * @returns {Promise<number>} the exit code
 */
async function main(args) {
    const [group, action, name, ...rest] = args;
    if (group !== 'plugin' || rest.length > 0) {
        return usage();
    }
    const connection = readConnection();
    if (!connection) {
        return 1;
    }
    try {
        switch (action) {
            case 'list':
                return name === undefined ? await listPlugins(connection) : usage();
            case 'install':
                return name === undefined ? usage() : await installPlugin(connection, name);
            case 'remove':
                return name === undefined ? usage() : await removePlugin(connection, name);
            default:
                return usage();
        }
    } catch (error) {
        console.error(`poweragents: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
    }
}

/** @param {Connection} connection */
async function listPlugins(connection) {
    /** @type {Plugin[]} */
    const plugins = await call(connection, 'GET', '/plugins');
    const installed = plugins.filter(plugin => plugin.installed);
    const available = plugins.filter(plugin => !plugin.installed && !plugin.errors);
    const broken = plugins.filter(plugin => !plugin.installed && plugin.errors);

    const lines = [
        installed.length > 0 ? 'Installed here:' : 'No plugins installed here.',
        ...installed.map(describePlugin),
    ];
    if (available.length > 0) {
        lines.push('', 'Available to install:', ...available.map(describePlugin));
    }
    if (broken.length > 0) {
        lines.push('', 'Not loaded, with errors:', ...broken.map(describePlugin));
    }
    console.log(lines.join('\n'));
    return 0;
}

/**
 * @param {Connection} connection
 * @param {string} name
 */
async function installPlugin(connection, name) {
    /** @type {InstallResult} */
    const result = await call(connection, 'POST', '/plugins/install', { name });
    const where = result.projectName != null ? `in the project "${result.projectName}"` : 'in the profile';
    const lines = [];
    if (result.source === 'own') {
        lines.push(
            `${result.plugin} is your own plugin, installed by its folder being there; its skills and environment are up to date.`,
        );
    } else if (result.added) {
        lines.push(`Installed ${result.plugin} ${where}.`, 'Tell the person you installed it.');
        if (result.onboardingSkill != null) {
            lines.push(`Now load the skill ${result.onboardingSkill} and follow it in this conversation.`);
        }
    } else {
        lines.push(`${result.plugin} was installed ${where} already.`);
    }
    if (result.environmentError) {
        lines.push('', ...describeEnvironmentError(result.environmentError));
    }
    console.log(lines.join('\n'));
    return result.environmentError ? 1 : 0;
}

/**
 * @param {Connection} connection
 * @param {string} name
 */
async function removePlugin(connection, name) {
    /** @type {RemoveResult} */
    const result = await call(connection, 'POST', '/plugins/remove', { name });
    const where = result.projectName != null ? `from the project "${result.projectName}"` : 'from the profile';
    console.log(`Removed ${result.plugin} ${where}.`);
    return 0;
}

/**
 * Calls the daemon; the parsed JSON of a success, typed as the route answers it, or throws with the daemon's message.
 * @template T
 * @param {Connection} connection
 * @param {'GET' | 'POST'} method
 * @param {string} path
 * @param {object} [body]
 * @returns {Promise<T>}
 */
async function call(connection, method, path, body) {
    let response;
    try {
        response = await fetch(`${connection.url}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${connection.token}`,
                'X-Opencode-Session': connection.session,
                ...(body && { 'Content-Type': 'application/json' }),
            },
            body: body && JSON.stringify(body),
        });
    } catch (error) {
        throw new Error(
            `the poweragents app could not be reached (${error instanceof Error ? error.message : String(error)})`,
            { cause: error },
        );
    }
    /** @type {unknown} */
    const json = await response.json().catch(() => null);
    if (!response.ok) {
        const message =
            typeof json === 'object' && json !== null && 'message' in json && typeof json.message === 'string'
                ? json.message
                : `the app answered ${response.status}`;
        throw new Error(message);
    }
    return /** @type {T} */ (json);
}

/** The daemon's address, the token and the conversation, from the agent's shell; `null`, said on stderr, when missing. */
function readConnection() {
    const url = process.env.POWERAGENTS_DAEMON_URL;
    const token = process.env.POWERAGENTS_BROWSER_TOKEN;
    const session = process.env.OPENCODE_SESSION_ID;
    const missing = Object.entries({
        POWERAGENTS_DAEMON_URL: url,
        POWERAGENTS_BROWSER_TOKEN: token,
        OPENCODE_SESSION_ID: session,
    })
        .filter(([, value]) => !value)
        .map(([key]) => key);
    if (!url || !token || !session) {
        console.error(`poweragents: ${missing.join(', ')} not set; the command works only from the agent's own shell.`);
        return null;
    }
    return { url, token, session };
}

/** @param {Plugin} plugin */
function describePlugin(plugin) {
    const kind = [plugin.level && `${plugin.level} plugin`, plugin.source === 'own' && 'your own'].filter(Boolean);
    const head = `- ${plugin.name}${kind.length > 0 ? ` (${kind.join(', ')})` : ''}`;
    const lines = [
        plugin.title ? `${head}: ${plugin.title}${plugin.description ? `. ${plugin.description}` : ''}` : head,
    ];
    if (plugin.errors) {
        lines.push(`  Errors: ${plugin.errors.map(error => JSON.stringify(error)).join(', ')}`);
    }
    if (plugin.environmentError) {
        lines.push(...describeEnvironmentError(plugin.environmentError).map(line => `  ${line}`));
    }
    return lines.join('\n');
}

/** @param {EnvironmentError} error */
function describeEnvironmentError(error) {
    if (error.code === 'conflict') {
        return [
            `Its environment is not applied: it pins the ${error.part} package ${error.package} at another version than the plugin ${error.plugin}, which wins.`,
        ];
    }
    return [
        `Its environment is not applied: installing the ${error.part} packages failed${error.exitCode == null ? '' : ` (exit code ${error.exitCode})`}. The plugin stays installed and its skills work. Output:`,
        error.output,
    ];
}

function usage() {
    console.error(USAGE);
    return 2;
}
