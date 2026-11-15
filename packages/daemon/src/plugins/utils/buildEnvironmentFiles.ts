import path from 'node:path';

import type { PluginEnvironmentError, PluginEnvironmentPart } from '@poweragents/common/api/PluginTypes.js';

import type { PluginEnvironment } from '../parsePluginManifest.js';

/** A loaded plugin that adds to the agent's environment. */
export interface EnvironmentPlugin {
    name: string;
    /** The plugin's folder as the agent's container sees it: an absolute POSIX path. */
    dir: string;
    environment: PluginEnvironment;
}

/** What the agent's environment is installed from. */
export interface EnvironmentFiles {
    /** The Node part's `package.json`: every npm pin, and each plugin's CLI as a `file:` dependency. */
    packageJson: string;
    /** The Python part's `requirements.in`, one `name==version` per line; empty when no plugin adds a Python package. */
    requirements: string;
    /** The plugins adding to each part, by name: the ones a failed install of the part is reported on. */
    parts: Record<PluginEnvironmentPart, string[]>;
    /** The plugins left out of the environment, with why. */
    conflicts: Map<string, PluginEnvironmentError>;
}

/**
 * The scope of the plugins' CLIs in `node_modules`: a plugin's CLI is the dependency `@poweragents-plugins/<plugin>`. A
 * CLI whose `bin` is a single path gets the plugin's name as its command.
 */
export const CLI_PACKAGE_SCOPE = '@poweragents-plugins';

interface FindConflictParams {
    plugin: string;
    part: PluginEnvironmentPart;
    pins: [string, string][];
    /** The pins of the plugins before it. */
    taken: Map<string, Pin>;
}

/** A package and its pinned version or `file:` source, with the plugin that pinned it first. */
interface Pin {
    value: string;
    plugin: string;
}

/**
 * Renders the files the agent's environment is installed from. Plugins are taken in name order; one that pins a package
 * at another version than a plugin before it is left out whole (a CLI built against one version may not work with the
 * other), with a `conflict` error, and the rest still apply. Python names are compared normalized (PEP 503), so
 * `Requests` and `requests` are the same package. Same input, same files, byte for byte.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function buildEnvironmentFiles(plugins: EnvironmentPlugin[]): EnvironmentFiles {
    const npm = new Map<string, Pin>();
    const python = new Map<string, Pin>();
    const parts: Record<PluginEnvironmentPart, string[]> = { npm: [], python: [] };
    const conflicts = new Map<string, PluginEnvironmentError>();

    for (const plugin of plugins.toSorted((a, b) => compare(a.name, b.name))) {
        const npmPins = npmPinsOf(plugin);
        const pythonPins = pythonPinsOf(plugin);
        const conflict =
            findConflict({ plugin: plugin.name, part: 'npm', pins: npmPins, taken: npm }) ??
            findConflict({ plugin: plugin.name, part: 'python', pins: pythonPins, taken: python });
        if (conflict) {
            conflicts.set(plugin.name, conflict);
            continue;
        }

        for (const [name, value] of npmPins) {
            npm.set(name, { value, plugin: plugin.name });
        }
        for (const [name, value] of pythonPins) {
            python.set(name, { value, plugin: plugin.name });
        }
        if (npmPins.length > 0) {
            parts.npm.push(plugin.name);
        }
        if (pythonPins.length > 0) {
            parts.python.push(plugin.name);
        }
    }

    const dependencies = Object.fromEntries(
        [...npm].toSorted(([a], [b]) => compare(a, b)).map(([name, pin]) => [name, pin.value]),
    );
    const requirements = [...python]
        .toSorted(([a], [b]) => compare(a, b))
        .map(([name, pin]) => `${name}==${pin.value}\n`)
        .join('');

    return {
        packageJson: `${JSON.stringify({ private: true, dependencies }, null, 4)}\n`,
        requirements,
        parts,
        conflicts,
    };
}

/** @__NO_SIDE_EFFECTS__ */
function npmPinsOf(plugin: EnvironmentPlugin) {
    const pins = Object.entries(plugin.environment.npm ?? {});
    if (plugin.environment.cli != null) {
        pins.push([
            `${CLI_PACKAGE_SCOPE}/${plugin.name}`,
            `file:${path.posix.join(plugin.dir, plugin.environment.cli)}`,
        ]);
    }
    return pins;
}

/** @__NO_SIDE_EFFECTS__ */
function pythonPinsOf(plugin: EnvironmentPlugin) {
    return Object.entries(plugin.environment.python ?? {}).map(([name, version]): [string, string] => [
        name.toLowerCase().replaceAll(/[-_.]+/g, '-'),
        version,
    ]);
}

/**
 * The first of the plugin's pins that differs from a pin of an earlier plugin, or from another of its own pins (two
 * spellings of one Python name, a conflict with itself).
 * @__NO_SIDE_EFFECTS__
 */
function findConflict({ plugin, part, pins, taken }: FindConflictParams): PluginEnvironmentError | null {
    const own = new Map<string, string>();
    for (const [name, value] of pins) {
        const earlier = taken.get(name);
        if (earlier && earlier.value !== value) {
            return { code: 'conflict', part, package: name, plugin: earlier.plugin };
        }
        const mine = own.get(name);
        if (mine !== undefined && mine !== value) {
            return { code: 'conflict', part, package: name, plugin };
        }
        own.set(name, value);
    }
    return null;
}

/** Code-point order, the same on every machine (unlike `localeCompare`). @__NO_SIDE_EFFECTS__ */
function compare(a: string, b: string) {
    return a < b ? -1 : a > b ? 1 : 0;
}
