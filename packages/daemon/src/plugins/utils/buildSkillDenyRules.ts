import type { PluginInfo } from '@poweragents/common/api/PluginTypes.js';
import type { OpencodePermissionRule } from '@poweragents/opencode/OpencodeTypes.js';

/**
 * The permission rules that hide from a conversation in `projectId` the skills of the project plugins installed in other
 * projects but not in this one. The skills folder holds every installed plugin's skills for all projects alike, so a
 * plugin installed in one project only is hidden everywhere else by a deny rule per skill (`<plugin>:<skill>`). A plugin
 * installed in the profile, or not loaded (one with errors, which is not copied), needs none.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function buildSkillDenyRules(projectId: string, plugins: PluginInfo[]): OpencodePermissionRule[] {
    const rules: OpencodePermissionRule[] = [];
    for (const plugin of plugins) {
        if (!plugin.details || plugin.errors.length > 0 || !isInstalledElsewhereOnly(plugin, projectId)) {
            continue;
        }
        for (const skill of plugin.details.skills) {
            rules.push({ action: 'skill', resource: `${plugin.name}:${skill}`, effect: 'deny' });
        }
    }
    return rules;
}

/** @__NO_SIDE_EFFECTS__ */
function isInstalledElsewhereOnly(plugin: PluginInfo, projectId: string) {
    let elsewhere = false;
    for (const install of plugin.installs) {
        if ('profile' in install || install.projectId === projectId) {
            return false;
        }
        elsewhere = true;
    }
    return elsewhere;
}
