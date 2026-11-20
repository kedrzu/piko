/**
 * What marks the daemon's note that a plugin's command was not run (design D42), in the metadata of the synthetic input
 * carrying it: tells it apart from OpenCode's synthetic input and from the daemon's other hidden input.
 */
export const PLUGIN_MISSING_NOTE = { piko: 'pluginMissing' } as const;

/**
 * The plugin a note that its command was not run names, from the metadata of synthetic input; `undefined` for any other
 * synthetic input.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function readPluginMissingNote(metadata: Record<string, unknown> | undefined): string | undefined {
    if (metadata?.piko !== PLUGIN_MISSING_NOTE.piko || typeof metadata.plugin !== 'string') {
        return undefined;
    }
    return metadata.plugin;
}
