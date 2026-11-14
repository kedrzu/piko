import { PLUGIN_NAME_PATTERN } from '../../plugins/parsePluginManifest.js';

/** A plugin's command at the start of a message: `/<plugin>:<skill>`. */
export interface PluginCommand {
    plugin: string;
    skill: string;
}

/** `/<plugin>:<skill>` at the very start, followed by whitespace or nothing. */
const COMMAND_PATTERN = /^\/([^\s:]+):(\S+)(?:\s|$)/;

/**
 * The plugin's command a message starts with, `/<plugin>:<skill>` followed by whitespace or nothing; `undefined` for
 * any other message, `/init` and a command of an invalid plugin or skill name among them.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parsePluginCommand(text: string): PluginCommand | undefined {
    const match = COMMAND_PATTERN.exec(text);
    if (!match) {
        return undefined;
    }
    const [, plugin = '', skill = ''] = match;
    if (!PLUGIN_NAME_PATTERN.test(plugin) || !PLUGIN_NAME_PATTERN.test(skill)) {
        return undefined;
    }
    return { plugin, skill };
}
