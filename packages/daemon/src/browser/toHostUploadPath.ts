import path from 'node:path';

import { AGENT_DATA_ROOT } from '../sandbox/buildAgentRunArgs.js';

/**
 * Maps a file path as the agent sees it (`/Poweragents/projects/a/report.pdf`) to the same file on this computer, under
 * `dataRoot`; `null` for anything that is not a file path inside the data root. The check is lexical only: a `..`
 * segment is refused outright rather than resolved, and so are a backslash (a separator on Windows) and a NUL. Links
 * are the IO side's to refuse (`stageUpload`), since only the filesystem knows them.
 * @__NO_SIDE_EFFECTS__
 */
export function toHostUploadPath(agentPath: unknown, dataRoot: string): string | null {
    if (typeof agentPath !== 'string' || agentPath.includes('\\') || agentPath.includes('\0')) {
        return null;
    }
    const prefix = `${AGENT_DATA_ROOT}/`;
    if (!agentPath.startsWith(prefix)) {
        return null;
    }
    const segments = agentPath
        .slice(prefix.length)
        .split('/')
        .filter(segment => segment !== '' && segment !== '.');
    if (segments.length === 0 || segments.includes('..')) {
        return null;
    }
    return path.join(dataRoot, ...segments);
}
