import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { BrowserServiceShape } from './BrowserService.js';
import { CdpError } from './CdpTypes.js';
import type { CdpParams } from './checkCdpRequest.js';
import { readTargetInfo } from './readTargetInfo.js';

/**
 * The isolated world every client's evaluation, resolved node, init script and binding lands in (stealth-browsing D8).
 * Pages never see world names; an ordinary one keeps it unremarkable anyway.
 */
export const ISOLATED_WORLD_NAME = 'utility';

/** A call to run in the daemon's isolated world of a session's main frame. */
export interface IsolatedCall {
    method: string;
    params: CdpParams;
    sessionId: string;
    /** The parameter naming the execution context: `contextId` for `Runtime.evaluate`, else `executionContextId`. */
    contextParam: 'contextId' | 'executionContextId';
}

/** What one tunnel client's sessions know about their worlds: the isolated contexts and which sessions are workers. */
export interface IsolatedWorlds {
    /** Whether `contextId` is a context a `Page.createIsolatedWorld` reply on `sessionId` named. */
    isIsolatedContext(sessionId: string, contextId: unknown): boolean;
    /** Whether the session is attached to a worker, which has no isolated world. */
    isWorker(sessionId: string): boolean;
    /** Records the context of a `Page.createIsolatedWorld` reply on `sessionId`. */
    recordWorld(sessionId: string, reply: unknown): void;
    /** Learns a session's target type from its `Target.attachedToTarget` parameters. */
    observeAttached(params: unknown): void;
    /** Forgets a detached session. */
    forget(sessionId: string): void;
    /**
     * Sends `call` with its context set to the daemon's world of the session's main frame, created (or, for the current
     * document, found) first. A navigation between the two invalidates the context; the call is then resolved again and
     * retried once.
     */
    send(call: IsolatedCall): Promise<unknown>;
}

/** The browser's errors for a context or frame that went away with a navigation. */
const GONE_ERRORS = ['Cannot find context with specified id', 'No frame for given id found'];

/** The target types with frames, hence isolated worlds; every other type a session attaches to is a worker. */
const FRAME_TARGET_TYPES = new Set(['page', 'iframe']);

/**
 * Creates the isolated-world record of one tunnel client. Context ids are not cached for sending: each call asks
 * `Page.createIsolatedWorld` again, which returns the existing world for the current document. Only the main frame's
 * id is cached, per session.
 * @__NO_SIDE_EFFECTS__
 */
export function createIsolatedWorlds(browser: Pick<BrowserServiceShape, 'send'>): IsolatedWorlds {
    const contexts = new Map<string, Set<number>>();
    const mainFrames = new Map<string, string>();
    const workers = new Set<string>();

    return {
        isIsolatedContext: (sessionId, contextId) =>
            typeof contextId === 'number' && contexts.get(sessionId)?.has(contextId) === true,
        isWorker: sessionId => workers.has(sessionId),
        recordWorld,
        observeAttached,
        forget,
        send,
    };

    function recordWorld(sessionId: string, reply: unknown) {
        const contextId = isPlainObject(reply) ? reply['executionContextId'] : undefined;
        if (typeof contextId !== 'number') {
            return undefined;
        }
        const known = contexts.get(sessionId) ?? new Set<number>();
        known.add(contextId);
        contexts.set(sessionId, known);
        return contextId;
    }

    function observeAttached(params: unknown) {
        const info = readTargetInfo(params);
        const sessionId = isPlainObject(params) ? params['sessionId'] : undefined;
        if (info && typeof sessionId === 'string' && !FRAME_TARGET_TYPES.has(info.type)) {
            workers.add(sessionId);
        }
    }

    function forget(sessionId: string) {
        contexts.delete(sessionId);
        mainFrames.delete(sessionId);
        workers.delete(sessionId);
    }

    async function send(call: IsolatedCall) {
        try {
            return await sendOnce(call);
        } catch (error) {
            if (!(error instanceof CdpError) || !GONE_ERRORS.some(message => error.message.includes(message))) {
                throw error;
            }
            mainFrames.delete(call.sessionId);
            return sendOnce(call);
        }
    }

    async function sendOnce(call: IsolatedCall) {
        const { method, params, sessionId, contextParam } = call;
        const frameId = await readMainFrame(sessionId);
        const reply = await browser.send(
            'Page.createIsolatedWorld',
            { frameId, worldName: ISOLATED_WORLD_NAME },
            sessionId,
        );
        const contextId = recordWorld(sessionId, reply);
        if (contextId == null) {
            throw new TypeError('Page.createIsolatedWorld gave no context id');
        }
        return browser.send(method, { ...params, [contextParam]: contextId }, sessionId);
    }

    async function readMainFrame(sessionId: string) {
        const cached = mainFrames.get(sessionId);
        if (cached != null) {
            return cached;
        }
        const reply = await browser.send('Page.getFrameTree', {}, sessionId);
        const tree = isPlainObject(reply) ? reply['frameTree'] : undefined;
        const frame = isPlainObject(tree) ? tree['frame'] : undefined;
        const frameId = isPlainObject(frame) ? frame['id'] : undefined;
        if (typeof frameId !== 'string') {
            throw new TypeError('Page.getFrameTree gave no main frame');
        }
        mainFrames.set(sessionId, frameId);
        return frameId;
    }
}
