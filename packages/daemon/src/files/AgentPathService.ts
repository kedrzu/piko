import path from 'node:path';

import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';

import { OpencodeSessionGetCommand } from '@piko/opencode/OpencodeSessionGetCommand.js';

import { ProjectService } from '../projects/ProjectService.js';
import { AGENT_PROJECTS_DIR } from '../sandbox/buildAgentRunArgs.js';
import type { ProjectFileRef } from './FileAgentStateService.js';

/**
 * The paths the agent names, as project files. The agent names a file by its path in its container: absolute, or
 * relative to the folder of the session it works in.
 */
export interface AgentPathServiceShape {
    /** The session's folder as the agent sees it, as learned when the session was created. */
    noteSession(sessionId: string, directory: string): void;
    /**
     * The project files among `paths`: an absolute path inside a project's folder, or a relative one inside the
     * session's folder when that is inside a project's. A path anywhere else is no project file and is left out.
     */
    toProjectFiles(sessionId: string, paths: string[]): Promise<ProjectFileRef[]>;
}

/** The agent's paths as project files. */
export const AgentPathService = defineService({
    name: 'AgentPathService',
    deps: { logger: Logger, projects: ProjectService, getSession: OpencodeSessionGetCommand },
    setup({ logger, projects, getSession }): AgentPathServiceShape {
        /** Each session's folder as the agent sees it, as learned: a relative path the agent names is inside it. */
        const sessionDirs = new Map<string, string>();

        return { noteSession, toProjectFiles };

        function noteSession(sessionId: string, directory: string) {
            sessionDirs.set(sessionId, directory);
        }

        async function toProjectFiles(sessionId: string, paths: string[]) {
            const all = await projects.list();
            const files: ProjectFileRef[] = [];
            for (const file of paths) {
                let absolute = file;
                if (!path.posix.isAbsolute(file)) {
                    const dir = await findSessionDir(sessionId);
                    if (dir === undefined) {
                        continue;
                    }
                    absolute = path.posix.join(dir, file);
                }
                const relative = path.posix.relative(AGENT_PROJECTS_DIR, absolute);
                if (relative.startsWith('..') || path.posix.isAbsolute(relative)) {
                    continue;
                }
                const [folder, ...inProject] = relative.split('/');
                const project = all.find(candidate => path.basename(candidate.dir) === folder);
                if (project && inProject.length > 0) {
                    files.push({ projectId: project.id, path: inProject.join('/') });
                }
            }
            return files;
        }

        /** The session's folder: as it was created, or asked from the agent for a session created before the feed. */
        async function findSessionDir(sessionId: string) {
            const known = sessionDirs.get(sessionId);
            if (known !== undefined) {
                return known;
            }
            try {
                const session = await getSession(sessionId);
                if (session) {
                    sessionDirs.set(sessionId, session.directory);
                }
                return session?.directory;
            } catch (error) {
                logger.warn('Agent session could not be read, its paths not resolved', { sessionId, error });
                return undefined;
            }
        }
    },
});
