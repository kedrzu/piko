import path from 'node:path';

import { HttpError } from '@nzyme/fetch-utils/HttpError.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { assert } from '@nzyme/utils/assert.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';
import type { EventEmitter } from '@nzyme/utils/createEventEmitter.js';

import type { PluginInstalledEvent } from '@poweragents/common/api/DaemonEventTypes.js';
import type {
    PluginEnvironmentError,
    PluginError,
    PluginInfo,
    PluginLevel,
    PluginSource,
} from '@poweragents/common/api/PluginTypes.js';
import { OpencodeSessionGetCommand } from '@poweragents/opencode/OpencodeSessionGetCommand.js';

import { toAgentDir } from '../conversations/utils/toAgentDir.js';
import { PLUGINS_FOLDER, SANDBOX_API_PORT } from '../env.js';
import { PluginCatalog } from '../plugins/PluginCatalog.js';
import { PluginService } from '../plugins/PluginService.js';
import { PLUGIN_NAME_PATTERN } from '../plugins/parsePluginManifest.js';
import { ProjectService } from '../projects/ProjectService.js';
import type { LocalProject } from '../projects/ProjectService.js';
import { AGENT_DATA_ROOT } from '../sandbox/buildAgentRunArgs.js';
import { SandboxTokenCheckCommand } from '../sandbox/SandboxTokenCheckCommand.js';

/**
 * The daemon's HTTP API for the agent's container, which the `poweragents` command in the image calls
 * (`POWERAGENTS_DAEMON_URL`). Every request carries the sandbox's bearer token, checked before anything else: a request
 * without it gets 401 whatever it asks for. The conversation is the OpenCode session in the
 * `X-Opencode-Session` header, and its project is the project whose folder is the session's directory; a session outside
 * the projects is refused. Routes, with JSON bodies:
 *
 * - `GET /plugins` → {@link SandboxPlugin}[]
 * - `POST /plugins/install` `{ name }` → {@link SandboxPluginInstallResult}, and a `pluginInstalled` event
 * - `POST /plugins/remove` `{ name }` → {@link SandboxPluginRemoveResult}
 *
 * A failure answers `{ error, message }` with its status: `PluginService`'s errors as they are, and this API's own.
 */
export interface SandboxApiServiceShape {
    /** Starts the API on loopback; `port` defaults to `SANDBOX_API_PORT` (tests pass `0` for a free one). */
    listen(port?: number): SandboxApiServer;
    /** After every installation the agent asked for, with the conversation it asked from. */
    readonly pluginInstalled: EventEmitter<[event: PluginInstalledEvent]>;
}

/** A running API. */
export interface SandboxApiServer {
    /** The loopback port it accepts connections on. */
    port: number;
    /** Stops accepting and closes every connection. */
    close(): Promise<void>;
}

/** A plugin as the agent sees it from a conversation: kept short, as the command prints it for the model. */
export interface SandboxPlugin {
    name: string;
    source: PluginSource;
    /** Absent when the plugin's `plugin.json` cannot be read; `errors` say why. */
    level?: PluginLevel;
    /** The English title and description. */
    title?: string;
    description?: string;
    /**
     * Whether the agent has it in this conversation: a `profile` plugin installed, a `project` plugin installed in the
     * conversation's project, an own plugin without errors.
     */
    installed: boolean;
    /** Why the plugin is not loaded; omitted when empty. */
    errors?: PluginError[];
    /** Why its environment is not applied; omitted when it is. */
    environmentError?: PluginEnvironmentError;
}

/** What `POST /plugins/install` did. */
export interface SandboxPluginInstallResult {
    plugin: string;
    source: PluginSource;
    level: PluginLevel;
    /** The project a `project` plugin was installed in: the conversation's. */
    projectName?: string;
    /** Whether the installation is new; `false` for one there already and for an own plugin. */
    added: boolean;
    /** The skill the agent loads now to set the plugin up, as `<plugin>:<skill>`, when the plugin has one. */
    onboardingSkill?: string;
    /** Why the plugin's environment is not applied; the plugin stays installed. */
    environmentError?: PluginEnvironmentError;
}

/** What `POST /plugins/remove` removed. */
export interface SandboxPluginRemoveResult {
    plugin: string;
    level: PluginLevel;
    /** The project a `project` plugin was removed from: the conversation's. */
    projectName?: string;
}

/** The conversation a request comes from. */
interface SandboxConversation {
    conversationId: string;
    project: LocalProject;
}

const SESSION_HEADER = 'x-opencode-session';
/** An OpenCode session id (`ses_…`). */
const SESSION_ID_PATTERN = /^[\w-]{1,128}$/;
/** A body is `{ name }`: anything larger is not one. */
const BODY_MAX_BYTES = 4096;

/** What the agent asks the daemon for from inside the sandbox: its plugins, for now. */
export const SandboxApiService = defineService({
    name: 'SandboxApiService',
    deps: {
        logger: Logger,
        checkToken: SandboxTokenCheckCommand,
        getSession: OpencodeSessionGetCommand,
        projects: ProjectService,
        catalog: PluginCatalog,
        plugins: PluginService,
    },
    setup({ logger, checkToken, getSession, projects, catalog, plugins }): SandboxApiServiceShape {
        const pluginInstalled = createEventEmitter<[event: PluginInstalledEvent]>();

        return { listen, pluginInstalled: pluginInstalled.event };

        function listen(port = SANDBOX_API_PORT) {
            const server = Bun.serve({ hostname: '127.0.0.1', port, fetch: handle });
            const boundPort = server.port;
            if (boundPort == null) {
                void server.stop(true);
                throw new Error('The sandbox API listens on no port');
            }
            logger.info('The sandbox API is listening', { port: boundPort });
            return { port: boundPort, close: () => server.stop(true) };
        }

        async function handle(request: Request) {
            if (!(await checkToken(request.headers.get('authorization')))) {
                logger.warn('Sandbox API request without a valid token refused');
                return Response.json({ error: 'Unauthorized', message: 'A valid token is required' }, { status: 401 });
            }
            const url = new URL(request.url);
            try {
                // A browser page sends Origin; the agent's command does not. A page must never reach the API.
                if (request.headers.has('origin')) {
                    throw new HttpError(403, { error: 'Forbidden', message: 'Requests from web pages are refused' });
                }
                return await route(request, url.pathname);
            } catch (error) {
                if (error instanceof HttpError) {
                    logger.info('Sandbox API request refused', { path: url.pathname, status: error.status });
                    return Response.json(
                        { error: readErrorCode(error), message: error.message },
                        { status: error.status },
                    );
                }
                logger.error('Sandbox API request failed', { path: url.pathname, error });
                return Response.json({ error: 'InternalError', message: 'The daemon failed' }, { status: 500 });
            }
        }

        async function route(request: Request, pathname: string) {
            switch (pathname) {
                case '/plugins':
                    return request.method === 'GET'
                        ? Response.json(await listPlugins(await resolveConversation(request)))
                        : methodNotAllowed('GET');
                case '/plugins/install':
                    return request.method === 'POST'
                        ? Response.json(
                              await installPlugin(await resolveConversation(request), await readName(request)),
                          )
                        : methodNotAllowed('POST');
                case '/plugins/remove':
                    return request.method === 'POST'
                        ? Response.json(await removePlugin(await resolveConversation(request), await readName(request)))
                        : methodNotAllowed('POST');
                default:
                    throw new HttpError(404, { error: 'NotFound', message: 'No such route' });
            }
        }

        async function listPlugins({ project }: SandboxConversation) {
            const list = await plugins.list();
            const result: SandboxPlugin[] = [];
            for (const plugin of list) {
                const installed = isInstalledHere(plugin, project.id);
                // A bundled plugin with errors cannot be installed: nothing the agent can do with it unless it is there.
                if (plugin.source === 'bundled' && plugin.errors.length > 0 && plugin.installs.length === 0) {
                    continue;
                }
                const text = plugin.details?.marketplace.en;
                result.push({
                    name: plugin.name,
                    source: plugin.source,
                    level: plugin.details?.level,
                    title: text?.title,
                    description: text?.description,
                    installed,
                    errors: plugin.errors.length > 0 ? plugin.errors : undefined,
                    environmentError: plugin.environmentError ?? undefined,
                });
            }
            return result;
        }

        async function installPlugin(conversation: SandboxConversation, name: string) {
            const { project } = conversation;
            const found = await catalog.get(name);
            const projectId = found?.details?.level === 'project' ? project.id : undefined;
            const { plugin, added, environmentError } = await plugins.install({ name, projectId });
            assert(plugin.details, 'An installed plugin has details');
            logger.info('Plugin installed by the agent', {
                plugin: name,
                projectId: project.id,
                conversationId: conversation.conversationId,
                added,
            });
            pluginInstalled.emit({
                type: 'pluginInstalled',
                plugin: name,
                projectId: project.id,
                conversationId: conversation.conversationId,
            });
            const onboarding = plugin.details.onboarding;
            const result: SandboxPluginInstallResult = {
                plugin: name,
                source: plugin.source,
                level: plugin.details.level,
                projectName: projectId != null ? project.name : undefined,
                added,
                onboardingSkill: onboarding != null ? `${name}:${onboarding}` : undefined,
                environmentError: environmentError ?? undefined,
            };
            return result;
        }

        async function removePlugin({ project }: SandboxConversation, name: string) {
            const found = await catalog.get(name);
            if (found?.source === 'own') {
                throw new HttpError(409, {
                    error: 'OwnPluginNotRemovable',
                    message: `${name} is an own plugin, installed by its folder being there: delete the folder ${path.posix.join(AGENT_DATA_ROOT, PLUGINS_FOLDER, name)} to remove it`,
                });
            }
            const projectId = found?.details?.level === 'project' ? project.id : undefined;
            await plugins.remove({ name, projectId });
            const result: SandboxPluginRemoveResult = {
                plugin: name,
                level: projectId != null ? 'project' : 'profile',
                projectName: projectId != null ? project.name : undefined,
            };
            return result;
        }

        /** The conversation of the session the request names, which must be in a project. */
        async function resolveConversation(request: Request): Promise<SandboxConversation> {
            const sessionId = request.headers.get(SESSION_HEADER);
            if (sessionId == null || !SESSION_ID_PATTERN.test(sessionId)) {
                throw new HttpError(400, {
                    error: 'SessionMissing',
                    message: 'The X-Opencode-Session header names no session',
                });
            }
            const session = await getSession(sessionId);
            if (!session) {
                throw new HttpError(404, { error: 'ConversationNotFound', message: 'No conversation with this id' });
            }
            const project = (await projects.list()).find(item => toAgentDir(item.dir) === session.directory);
            if (!project) {
                throw new HttpError(403, {
                    error: 'ConversationNotInProject',
                    message: 'Plugins are managed only from a conversation in a project',
                });
            }
            return { conversationId: sessionId, project };
        }
    },
});

/** @__NO_SIDE_EFFECTS__ */
function isInstalledHere(plugin: PluginInfo, projectId: string) {
    return plugin.installs.some(install =>
        'projectId' in install ? install.projectId === projectId : install.profile,
    );
}

/** @__NO_SIDE_EFFECTS__ */
function methodNotAllowed(allowed: string) {
    return Response.json(
        { error: 'MethodNotAllowed', message: `Only ${allowed}` },
        { status: 405, headers: { Allow: allowed } },
    );
}

/** The plugin name in a `{ name }` body, read up to `BODY_MAX_BYTES`. */
async function readName(request: Request) {
    const text = await readBody(request);
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch {
        throw new HttpError(400, { error: 'InvalidBody', message: 'The body is not JSON' });
    }
    if (
        typeof value !== 'object' ||
        value === null ||
        !('name' in value) ||
        typeof value.name !== 'string' ||
        !PLUGIN_NAME_PATTERN.test(value.name)
    ) {
        throw new HttpError(400, { error: 'InvalidBody', message: 'The body is { "name": "<plugin name>" }' });
    }
    return value.name;
}

/** The body as text; throws 413 once it passes `BODY_MAX_BYTES`, without reading the rest. */
async function readBody(request: Request) {
    const tooLarge = new HttpError(413, { error: 'BodyTooLarge', message: 'The body is too large' });
    if (Number(request.headers.get('content-length') ?? 0) > BODY_MAX_BYTES) {
        throw tooLarge;
    }
    if (!request.body) {
        return '';
    }
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
        // Bun types a request body's chunks loosely; they are bytes.
        const chunk: unknown = read.value;
        assert(chunk instanceof Uint8Array, 'A request body chunk is bytes');
        size += chunk.byteLength;
        if (size > BODY_MAX_BYTES) {
            await reader.cancel();
            throw tooLarge;
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
}

/** @__NO_SIDE_EFFECTS__ */
function readErrorCode(error: HttpError) {
    const code = error.payload.error;
    return typeof code === 'string' ? code : 'Error';
}
