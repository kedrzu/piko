import type { Logger } from '@nzyme/logging/Logger.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { BrowserPaceShape, PacedCommand } from './BrowserPace.js';
import type { BrowserServiceShape } from './BrowserService.js';
import { CdpError } from './CdpTypes.js';
import type { CdpEvent } from './CdpTypes.js';
import { checkCdpRequest } from './checkCdpRequest.js';
import type { CdpParams, CdpRequestDecision } from './checkCdpRequest.js';
import { createIsolatedWorlds } from './createIsolatedWorlds.js';
import { readTargetInfo } from './readTargetInfo.js';
import { stageUpload } from './stageUpload.js';

/** The end of a tunnel socket the client writes to; Bun's `ServerWebSocket` is one. */
export interface TunnelSocket {
    send(text: string): unknown;
    close(code?: number, reason?: string): void;
}

/** One tunnel socket and what its client may reach. */
export interface ConnectTunnelClientParams {
    /** Unique per socket: the originator of the CDP sessions this client opens. */
    clientId: string;
    /** The conversation the socket belongs to; it owns the pages the client may see. */
    conversationId: string;
    socket: TunnelSocket;
    browser: BrowserServiceShape;
    /** The human pace every site is held to; shared by every client. */
    pace: BrowserPaceShape;
    /** The profile's data root on this computer, where uploads are taken from. */
    dataRoot: string;
    /** The daemon's own folder uploads are staged in (`stageUpload`'s `folder`). */
    uploadsFolder: string;
    logger: Logger;
}

/** A connected tunnel client: the socket's handlers call into it. */
export interface TunnelClient {
    /** Handles one text message from the socket: a CDP command. */
    receive(text: string): void;
    /** The socket closed: detaches every session this client opened; its pages stay. */
    close(): void;
}

/** A CDP error code the browser uses for a generic server error; the tunnel's own refusals carry it too. */
const SERVER_ERROR = -32_000;
/** A CDP error code for a message that is not JSON. */
const PARSE_ERROR = -32_700;
/** WebSocket close code: the server met a condition it cannot go on from. */
const CLOSE_SERVER_ERROR = 1011;

/** The target lifecycle events a client gets for its conversation's pages once it discovers targets. */
const TARGET_EVENTS = new Set([
    'Target.targetCreated',
    'Target.targetInfoChanged',
    'Target.targetDestroyed',
    'Target.targetCrashed',
]);

/**
 * Connects one tunnel socket to the shared browser: starts the browser, judges each command with `checkCdpRequest`,
 * and passes back only what belongs to the client. Events of a session go to the socket that opened it; target events
 * only for its conversation's pages, and only once it discovers targets; everything else is dropped. Replies carry the
 * client's own ids. A page the client creates is claimed for its conversation, and announced to it, since the
 * browser's own `Target.targetCreated` comes before the claim and is filtered out. Commands that act on a site wait
 * for its pace, and later commands of the same session wait behind them.
 */
export function connectTunnelClient(params: ConnectTunnelClientParams): TunnelClient {
    const { clientId, conversationId, socket, browser, pace, dataRoot, uploadsFolder, logger } = params;
    const { ownership } = browser;
    const worlds = createIsolatedWorlds(browser);
    const context = { clientId, conversationId, ownership, worlds, dataRoot };

    /** Top-level sessions this client opened, detached when it goes. */
    const sessions = new Set<string>();
    /** Targets the client was told about, so their `Target.targetDestroyed` (after ownership forgot them) reaches it. */
    const shownTargets = new Set<string>();
    /** `Target.targetCreated` of unowned targets while a `Target.createTarget` of this client is in flight, by target. */
    const createdWhileCreating = new Map<string, unknown>();
    /**
     * Per session (`undefined`: the browser itself), the moment the last command still waiting there is sent: a command
     * the pace holds keeps every later command of its session behind it, so none overtakes it on the wire.
     */
    const waiting = new Map<string | undefined, Promise<void>>();
    let creating = 0;
    let discovering = false;
    let closed = false;

    browser.event.on(onEvent);
    browser.exited.on(onExited);
    const started = browser.start().then(
        () => true,
        (error: unknown) => {
            logger.warn('The browser could not start for a tunnel client', { error });
            socket.close(CLOSE_SERVER_ERROR, 'The browser could not start');
            return false;
        },
    );

    return { receive, close };

    function receive(text: string) {
        void started.then(ok => (ok ? handleMessage(text) : undefined));
    }

    function close() {
        if (closed) {
            return;
        }
        closed = true;
        browser.event.off(onEvent);
        browser.exited.off(onExited);
        for (const sessionId of sessions) {
            browser.send('Target.detachFromTarget', { sessionId }).catch((error: unknown) => {
                logger.debug('A tunnel session could not be detached', { error });
            });
        }
        sessions.clear();
    }

    function onExited() {
        socket.close(CLOSE_SERVER_ERROR, 'The browser exited');
    }

    async function handleMessage(text: string) {
        let message: unknown;
        try {
            message = JSON.parse(text);
        } catch {
            sendError(undefined, PARSE_ERROR, 'Message must be valid JSON');
            return;
        }
        const id = isPlainObject(message) && typeof message['id'] === 'number' ? message['id'] : undefined;
        if (id == null) {
            sendError(undefined, SERVER_ERROR, 'A CDP message needs a numeric id');
            return;
        }

        const decision = checkCdpRequest(message, context);
        const paced = findPacedCommand(decision);
        const sessionId = isPlainObject(message) ? message['sessionId'] : undefined;
        const key = typeof sessionId === 'string' ? sessionId : undefined;
        const before = waiting.get(key);
        if (before == null && paced == null) {
            await execute(id, decision);
            return;
        }

        const { promise: sent, resolve: markSent } = Promise.withResolvers<void>();
        waiting.set(key, sent);
        try {
            await before;
            // The socket closed while an earlier command waited: nothing more is sent, and no site's slot is taken.
            if (closed) {
                return;
            }
            const verdict = paced == null ? undefined : await pace.gate(paced);
            if (verdict?.type === 'refuse') {
                sendError(id, SERVER_ERROR, verdict.message);
                return;
            }
            // The socket closed while this one waited: its sessions are detached, and nothing is sent for it any more.
            if (closed) {
                return;
            }
            // Runs up to the browser call before the next command of the session is let go.
            const executed = execute(id, decision);
            markSent();
            await executed;
        } finally {
            markSent();
            if (waiting.get(key) === sent) {
                waiting.delete(key);
            }
        }
    }

    async function execute(id: number, decision: CdpRequestDecision) {
        try {
            switch (decision.type) {
                case 'reply':
                    sendReply(id, decision.result);
                    return;
                case 'reject':
                    sendError(id, SERVER_ERROR, decision.message);
                    return;
                case 'upload':
                    touchSession(decision.sessionId);
                    sendReply(id, await upload(decision.files, decision.params, decision.sessionId));
                    return;
                case 'isolate':
                    touchSession(decision.call.sessionId);
                    sendReply(id, await worlds.send(decision.call));
                    return;
                case 'createWorld':
                    touchSession(decision.sessionId);
                    sendReply(id, await worlds.createClientWorld(decision.sessionId, decision.world));
                    return;
                case 'forward':
                    touchSession(decision.sessionId);
                    sendReply(id, await forward(decision.method, decision.params, decision.sessionId));
                    break;
            }
        } catch (error) {
            if (error instanceof CdpError) {
                sendError(id, error.code, error.message, error.data);
            } else {
                sendError(id, SERVER_ERROR, error instanceof Error ? error.message : 'The command failed');
            }
        }
    }

    async function upload(files: string[], uploadParams: CdpParams, sessionId: string) {
        const staged: string[] = [];
        for (const source of files) {
            staged.push(await stageUpload({ source, dataRoot, folder: uploadsFolder }));
        }
        return browser.send('DOM.setFileInputFiles', { ...uploadParams, files: staged }, sessionId);
    }

    async function forward(method: string, forwardParams: CdpParams, sessionId: string | undefined) {
        switch (method) {
            case 'Target.setDiscoverTargets':
                // The browser already discovers for the daemon; answered here, replaying what Chrome would replay.
                return setDiscoverTargets(forwardParams['discover'] === true);
            case 'Target.getTargets':
                return filterTargets(await browser.send(method, forwardParams));
            case 'Target.createTarget':
                return createTarget(forwardParams);
            case 'Target.attachToTarget':
                return attachToTarget(forwardParams);
            default:
                return browser.send(method, forwardParams, sessionId);
        }
    }

    async function setDiscoverTargets(discover: boolean) {
        if (discover && !discovering) {
            for (const targetId of ownership.getTargets(conversationId)) {
                const reply = await browser.send('Target.getTargetInfo', { targetId });
                if (isPlainObject(reply)) {
                    announceTarget(targetId, reply['targetInfo']);
                }
            }
        }
        discovering = discover;
        return {};
    }

    function filterTargets(reply: unknown) {
        const infos: unknown = isPlainObject(reply) ? reply['targetInfos'] : undefined;
        const targetInfos: unknown[] = [];
        if (!Array.isArray(infos)) {
            return { targetInfos };
        }
        const list: readonly unknown[] = infos;
        for (const targetInfo of list) {
            const targetId = readTargetInfo({ targetInfo })?.targetId;
            if (targetId != null && ownership.getTargetOwner(targetId) === conversationId) {
                shownTargets.add(targetId);
                targetInfos.push(targetInfo);
            }
        }
        return { targetInfos };
    }

    async function createTarget(createParams: CdpParams) {
        creating++;
        let reply: unknown;
        try {
            reply = await browser.send('Target.createTarget', createParams);
        } finally {
            creating--;
        }
        const targetId = isPlainObject(reply) ? reply['targetId'] : undefined;
        if (typeof targetId === 'string') {
            ownership.claimTarget(conversationId, targetId);
            const created = createdWhileCreating.get(targetId);
            if (discovering && isPlainObject(created)) {
                announceTarget(targetId, created['targetInfo']);
            }
        }
        if (creating === 0) {
            createdWhileCreating.clear();
        }
        return reply;
    }

    async function attachToTarget(attachParams: CdpParams) {
        const targetId = attachParams['targetId'];
        if (typeof targetId !== 'string') {
            throw new TypeError('Target.attachToTarget needs a targetId');
        }
        const release = ownership.expectAttach({ type: 'client', clientId }, targetId);
        let reply: unknown;
        try {
            reply = await browser.send('Target.attachToTarget', attachParams);
        } finally {
            release();
        }
        const sessionId = isPlainObject(reply) ? reply['sessionId'] : undefined;
        if (typeof sessionId === 'string') {
            ownership.claimSession({ type: 'client', clientId }, sessionId, targetId);
            sessions.add(sessionId);
        }
        return reply;
    }

    function onEvent(event: CdpEvent) {
        if (closed) {
            return;
        }
        forgetDetached(event);
        if (event.sessionId != null) {
            if (isOwnSession(event.sessionId)) {
                sendEvent(event);
            }
            return;
        }

        const eventParams = isPlainObject(event.params) ? event.params : {};
        switch (event.method) {
            case 'Target.attachedToTarget':
                onAttached(event, eventParams['sessionId']);
                return;
            case 'Target.detachedFromTarget':
                // Ownership forgot the session before this event; the client's own record still has it.
                if (typeof eventParams['sessionId'] === 'string' && sessions.delete(eventParams['sessionId'])) {
                    sendEvent(event);
                }
                return;
        }
        if (TARGET_EVENTS.has(event.method)) {
            onTargetEvent(event, eventParams);
        }
    }

    /** Drops what `worlds` holds for a detached session; a nested session's detach comes on its parent session. */
    function forgetDetached(event: CdpEvent) {
        const sessionId = isPlainObject(event.params) ? event.params['sessionId'] : undefined;
        if (event.method === 'Target.detachedFromTarget' && typeof sessionId === 'string') {
            worlds.forget(sessionId);
        }
    }

    function onAttached(event: CdpEvent, sessionId: unknown) {
        if (typeof sessionId === 'string' && isOwnSession(sessionId)) {
            sessions.add(sessionId);
            sendEvent(event);
        }
    }

    function onTargetEvent(event: CdpEvent, eventParams: CdpParams) {
        const info = readTargetInfo(eventParams);
        const targetId = info?.targetId ?? eventParams['targetId'];
        if (typeof targetId !== 'string') {
            return;
        }
        const isOwn = ownership.getTargetOwner(targetId) === conversationId;
        if (event.method === 'Target.targetCreated' && !isOwn && creating > 0) {
            createdWhileCreating.set(targetId, eventParams);
        }
        if (!discovering || !(isOwn || shownTargets.has(targetId))) {
            return;
        }
        if (event.method === 'Target.targetDestroyed') {
            shownTargets.delete(targetId);
        } else {
            shownTargets.add(targetId);
        }
        sendEvent(event);
    }

    function announceTarget(targetId: string, targetInfo: unknown) {
        shownTargets.add(targetId);
        sendEvent({ method: 'Target.targetCreated', params: { targetInfo } });
    }

    function isOwnSession(sessionId: string) {
        const originator = ownership.getSessionOriginator(sessionId);
        return originator?.type === 'client' && originator.clientId === clientId;
    }

    function touchSession(sessionId: string | undefined) {
        const targetId =
            sessionId != null && isOwnSession(sessionId) ? ownership.getSessionTarget(sessionId) : undefined;
        if (targetId != null) {
            ownership.touch(conversationId, targetId);
        }
    }

    function sendEvent(event: CdpEvent) {
        write({ method: event.method, params: event.params, sessionId: event.sessionId });
    }

    function sendReply(id: number, result: unknown) {
        write({ id, result: result ?? {} });
    }

    function sendError(id: number | undefined, code: number, message: string, data?: string) {
        write({ id, error: { code, message, data } });
    }

    function write(message: object) {
        if (!closed) {
            socket.send(JSON.stringify(message));
        }
    }
}

/**
 * What the pace judges of a decision: a forwarded command, or an evaluation run in the isolated world, which is how
 * agent-browser goes back and forward (`history.back()`). Anything else never loads a page.
 */
function findPacedCommand(decision: CdpRequestDecision): PacedCommand | undefined {
    switch (decision.type) {
        case 'forward':
            return decision;
        case 'isolate':
            return decision.call.method === 'Runtime.evaluate' ? decision.call : undefined;
        default:
            return undefined;
    }
}
