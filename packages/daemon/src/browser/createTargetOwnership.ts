import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { CdpEvent } from './CdpTypes.js';
import { readTargetInfo } from './readTargetInfo.js';

/** Who opened a CDP session: a tunnel client (one socket) or the daemon itself. */
export type SessionOriginator = { type: 'client'; clientId: string } | { type: 'daemon' };

/**
 * Who may see what in the one browser: each page target belongs to one conversation, each CDP session to one
 * originator. The browser service feeds it every event; the tunnel queries it and claims what its clients create.
 */
export interface TargetOwnership {
    /** Updates ownership from a browser event; call it with every event, before anyone else sees the event. */
    observe(event: CdpEvent): void;
    /** Gives a target to a conversation, e.g. the page a client's `Target.createTarget` made. */
    claimTarget(conversationId: string, targetId: string): void;
    /** Gives a session on `targetId` to an originator, e.g. from a `Target.attachToTarget` reply. */
    claimSession(originator: SessionOriginator, sessionId: string, targetId: string): void;
    /**
     * Records that `originator` is sending `Target.attachToTarget` for `targetId`, so the `Target.attachedToTarget`
     * event, which the browser sends before the reply, already claims the new session for it. Call it before sending;
     * the returned function forgets the attach if no event claimed it (call it once the reply, or an error, is in).
     */
    expectAttach(originator: SessionOriginator, targetId: string): () => void;
    /** The conversation a target belongs to; `undefined` for one nobody owns (the daemon's, or unknown). */
    getTargetOwner(targetId: string): string | undefined;
    /** Every target of a conversation. */
    getTargets(conversationId: string): string[];
    /** Who a session's events go to; `undefined` for a session nobody claimed. */
    getSessionOriginator(sessionId: string): SessionOriginator | undefined;
    /** The target a session is attached to. */
    getSessionTarget(sessionId: string): string | undefined;
    /** Marks a conversation's target as the one it used last. */
    touch(conversationId: string, targetId: string): void;
    /** The conversation's target used, or claimed, last; `undefined` when it has none left. */
    lastUsed(conversationId: string): string | undefined;
    /** Forgets everything; the browser is gone. */
    clear(): void;
}

/** A claimed session: whom its events go to and the target it is attached to. */
interface SessionRecord {
    originator: SessionOriginator;
    targetId: string;
}

/** A pending `Target.attachToTarget`. */
interface ExpectedAttach {
    originator: SessionOriginator;
}

/**
 * Creates the ownership registry of one browser run. A page opened by a page (a popup: `openerId`) belongs to its
 * opener's owner; a session auto-attached under another (`Target.attachedToTarget` carrying the parent's `sessionId`)
 * goes to the parent's originator, so a client sees its pages' workers and frames and nothing of anyone else's.
 * @__NO_SIDE_EFFECTS__
 */
export function createTargetOwnership(): TargetOwnership {
    const targetOwners = new Map<string, string>();
    const sessions = new Map<string, SessionRecord>();
    /** Pending top-level attaches per target, in the order they were sent: the browser answers the pipe in order. */
    const expectedAttaches = new Map<string, ExpectedAttach[]>();
    /** When each owned target was last touched or claimed; the highest is the conversation's last used. */
    const touchedAt = new Map<string, number>();
    let clock = 0;

    return {
        observe,
        claimTarget,
        claimSession,
        expectAttach,
        getTargetOwner: targetId => targetOwners.get(targetId),
        getTargets,
        getSessionOriginator: sessionId => sessions.get(sessionId)?.originator,
        getSessionTarget: sessionId => sessions.get(sessionId)?.targetId,
        touch,
        lastUsed,
        clear,
    };

    function observe(event: CdpEvent) {
        const params = isPlainObject(event.params) ? event.params : {};
        switch (event.method) {
            case 'Target.targetCreated':
                onTargetCreated(params);
                break;
            case 'Target.attachedToTarget':
                onAttached(params, event.sessionId);
                break;
            case 'Target.detachedFromTarget':
                if (typeof params['sessionId'] === 'string') {
                    sessions.delete(params['sessionId']);
                }
                break;
            case 'Target.targetDestroyed':
                if (typeof params['targetId'] === 'string') {
                    forgetTarget(params['targetId']);
                }
                break;
        }
    }

    function onTargetCreated(params: Record<string, unknown>) {
        const info = readTargetInfo(params);
        if (!info || info.type !== 'page' || info.openerId == null) {
            return;
        }
        const owner = targetOwners.get(info.openerId);
        if (owner != null) {
            claimTarget(owner, info.targetId);
        }
    }

    function onAttached(params: Record<string, unknown>, parentSessionId: string | undefined) {
        const info = readTargetInfo(params);
        const sessionId = params['sessionId'];
        if (!info || typeof sessionId !== 'string') {
            return;
        }

        if (parentSessionId != null) {
            const parent = sessions.get(parentSessionId);
            if (parent) {
                sessions.set(sessionId, { originator: parent.originator, targetId: info.targetId });
            }
            return;
        }

        const expected = expectedAttaches.get(info.targetId)?.shift();
        if (expected) {
            sessions.set(sessionId, { originator: expected.originator, targetId: info.targetId });
        }
    }

    function claimTarget(conversationId: string, targetId: string) {
        targetOwners.set(targetId, conversationId);
        touchedAt.set(targetId, ++clock);
    }

    function claimSession(originator: SessionOriginator, sessionId: string, targetId: string) {
        sessions.set(sessionId, { originator, targetId });
    }

    function expectAttach(originator: SessionOriginator, targetId: string) {
        const entry: ExpectedAttach = { originator };
        const queue = expectedAttaches.get(targetId) ?? [];
        queue.push(entry);
        expectedAttaches.set(targetId, queue);

        return () => {
            const current = expectedAttaches.get(targetId);
            if (!current) {
                return;
            }
            const index = current.indexOf(entry);
            if (index >= 0) {
                current.splice(index, 1);
            }
            if (current.length === 0) {
                expectedAttaches.delete(targetId);
            }
        };
    }

    function getTargets(conversationId: string) {
        const targets: string[] = [];
        for (const [targetId, owner] of targetOwners) {
            if (owner === conversationId) {
                targets.push(targetId);
            }
        }
        return targets;
    }

    function touch(conversationId: string, targetId: string) {
        if (targetOwners.get(targetId) === conversationId) {
            touchedAt.set(targetId, ++clock);
        }
    }

    function lastUsed(conversationId: string) {
        let latest: string | undefined;
        let latestAt = -1;
        for (const targetId of getTargets(conversationId)) {
            const at = touchedAt.get(targetId) ?? 0;
            if (at > latestAt) {
                latest = targetId;
                latestAt = at;
            }
        }
        return latest;
    }

    function forgetTarget(targetId: string) {
        targetOwners.delete(targetId);
        touchedAt.delete(targetId);
        expectedAttaches.delete(targetId);
        for (const [sessionId, session] of sessions) {
            if (session.targetId === targetId) {
                sessions.delete(sessionId);
            }
        }
    }

    function clear() {
        targetOwners.clear();
        sessions.clear();
        expectedAttaches.clear();
        touchedAt.clear();
    }
}
