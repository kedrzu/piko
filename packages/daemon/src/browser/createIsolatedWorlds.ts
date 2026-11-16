import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { BrowserServiceShape } from './BrowserService.js';
import { CdpError } from './CdpTypes.js';
import type { CdpParams } from './checkCdpRequest.js';

/**
 * The isolated world every client's evaluation, resolved node, init script and binding lands in (stealth-browsing D8).
 * Pages never see world names; an ordinary one keeps it unremarkable anyway.
 */
export const ISOLATED_WORLD_NAME = 'utility';

/**
 * A call to run in the daemon's isolated world: `DOM.resolveNode` in the world of the node's own frame, anything else
 * in the world of the session's main frame.
 */
export interface IsolatedCall {
    method: string;
    params: CdpParams;
    sessionId: string;
    /** The parameter naming the execution context: `contextId` for `Runtime.evaluate`, else `executionContextId`. */
    contextParam: 'contextId' | 'executionContextId';
}

/** The daemon's isolated worlds as one tunnel client uses them. */
export interface IsolatedWorlds {
    /** Forgets a detached session. */
    forget(sessionId: string): void;
    /**
     * Sends `call` with its context set to the daemon's world of its frame, created (or, for the current document,
     * found) first. A navigation between the two invalidates the context; the call is then resolved again and retried
     * once.
     */
    send(call: IsolatedCall): Promise<unknown>;
}

/** The browser's errors for a context or frame that went away with a navigation. */
const GONE_ERRORS = ['Cannot find context with specified id', 'No frame for given id found'];

/** The CDP error code of a method the target does not have: a worker has no Page domain. */
const METHOD_NOT_FOUND = -32_601;

/** Run on a node resolved in a frame's world: whether the node belongs to that frame's document. */
const IS_OWN_DOCUMENT = 'function () { return (this.ownerDocument ?? this) === document; }';

/** A node resolved in the world of one frame. */
interface Resolution {
    /** The browser's `DOM.resolveNode` reply. */
    reply: unknown;
    /** The resolved object; none when the frame's world cannot reach the node (a cross-origin frame's). */
    objectId?: string;
    /** Whether the node belongs to the frame's own document, so its world is the node's. */
    isOwn: boolean;
}

/**
 * Creates the isolated-world access of one tunnel client. Context ids are never cached, nor taken from the client:
 * Chrome reuses them across renderer processes, so after a cross-site navigation a remembered id can name the page's
 * own world. Each call asks `Page.createIsolatedWorld` again, which returns the existing world for the current
 * document. Only the main frame's id is cached, per session.
 * @__NO_SIDE_EFFECTS__
 */
export function createIsolatedWorlds(browser: Pick<BrowserServiceShape, 'send'>): IsolatedWorlds {
    const mainFrames = new Map<string, string>();

    return {
        forget: sessionId => {
            mainFrames.delete(sessionId);
        },
        send,
    };

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
        const mainFrame = await readMainFrame(call.sessionId);
        return call.method === 'DOM.resolveNode' ? resolveNode(call, mainFrame) : sendInFrame(call, mainFrame);
    }

    /**
     * Resolves a node in the world of its own frame. A frame's world resolves a node of a same-origin frame too, but
     * with that frame's globals, and cannot reach a node of a cross-origin frame in the same process; so the main
     * frame's world is tried first, then every other frame's, until one owns the node. With none, the first object
     * resolved is kept.
     */
    async function resolveNode(call: IsolatedCall, mainFrame: string) {
        const main = await resolveInFrame(call, mainFrame);
        if (main.isOwn) {
            return main.reply;
        }
        let kept = main;
        for (const frameId of await readFrames(call.sessionId)) {
            if (frameId === mainFrame) {
                continue;
            }
            let next: Resolution;
            try {
                next = await resolveInFrame(call, frameId);
            } catch (error) {
                // A frame that went away, or lives in another process, does not hold the node.
                if (error instanceof CdpError) {
                    continue;
                }
                throw error;
            }
            if (next.isOwn) {
                await releaseObject(call.sessionId, kept.objectId);
                return next.reply;
            }
            if (kept.objectId == null) {
                kept = next;
            } else {
                await releaseObject(call.sessionId, next.objectId);
            }
        }
        return kept.reply;
    }

    async function resolveInFrame(call: IsolatedCall, frameId: string): Promise<Resolution> {
        const reply = await sendInFrame(call, frameId);
        const object = isPlainObject(reply) ? reply['object'] : undefined;
        const objectId = isPlainObject(object) ? object['objectId'] : undefined;
        if (typeof objectId !== 'string') {
            return { reply, isOwn: false };
        }
        const checked = await browser.send(
            'Runtime.callFunctionOn',
            { objectId, functionDeclaration: IS_OWN_DOCUMENT, returnByValue: true },
            call.sessionId,
        );
        const result = isPlainObject(checked) ? checked['result'] : undefined;
        return { reply, objectId, isOwn: isPlainObject(result) && result['value'] === true };
    }

    async function sendInFrame(call: IsolatedCall, frameId: string) {
        const { method, params, sessionId, contextParam } = call;
        const world = await browser.send(
            'Page.createIsolatedWorld',
            { frameId, worldName: ISOLATED_WORLD_NAME },
            sessionId,
        );
        const contextId = isPlainObject(world) ? world['executionContextId'] : undefined;
        if (typeof contextId !== 'number') {
            throw new TypeError('Page.createIsolatedWorld gave no context id');
        }
        return browser.send(method, { ...params, [contextParam]: contextId }, sessionId);
    }

    async function releaseObject(sessionId: string, objectId: string | undefined) {
        if (objectId != null) {
            await browser.send('Runtime.releaseObject', { objectId }, sessionId);
        }
    }

    async function readMainFrame(sessionId: string) {
        const cached = mainFrames.get(sessionId);
        if (cached != null) {
            return cached;
        }
        const [frameId] = await readFrames(sessionId);
        if (frameId == null) {
            throw new TypeError('Page.getFrameTree gave no main frame');
        }
        mainFrames.set(sessionId, frameId);
        return frameId;
    }

    /** The ids of the session's frames, the main frame first. */
    async function readFrames(sessionId: string) {
        let reply: unknown;
        try {
            reply = await browser.send('Page.getFrameTree', {}, sessionId);
        } catch (error) {
            if (error instanceof CdpError && error.code === METHOD_NOT_FOUND) {
                throw new CdpError({ code: error.code, message: "Code cannot run in a worker of the agent's browser" });
            }
            throw error;
        }
        const frameIds: string[] = [];
        const pending: unknown[] = [isPlainObject(reply) ? reply['frameTree'] : undefined];
        while (pending.length > 0) {
            const tree = pending.shift();
            if (!isPlainObject(tree)) {
                continue;
            }
            const frame = tree['frame'];
            const frameId = isPlainObject(frame) ? frame['id'] : undefined;
            if (typeof frameId === 'string') {
                frameIds.push(frameId);
            }
            const children = tree['childFrames'];
            if (Array.isArray(children)) {
                const list: readonly unknown[] = children;
                pending.push(...list);
            }
        }
        return frameIds;
    }
}
