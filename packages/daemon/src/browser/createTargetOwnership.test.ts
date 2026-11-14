import { expect, test } from 'bun:test';

import type { CdpEvent } from './CdpTypes.js';
import { createTargetOwnership } from './createTargetOwnership.js';
import type { SessionOriginator } from './createTargetOwnership.js';

const CLIENT_A: SessionOriginator = { type: 'client', clientId: 'a' };
const CLIENT_B: SessionOriginator = { type: 'client', clientId: 'b' };

test('a popup belongs to the conversation that owns its opener', () => {
    const ownership = createTargetOwnership();
    ownership.claimTarget('conv-1', 'page-1');

    ownership.observe(targetCreated('popup-1', 'page-1'));
    ownership.observe(targetCreated('stranger', 'page-unowned'));
    ownership.observe(targetCreated('blank'));

    expect(ownership.getTargetOwner('popup-1')).toBe('conv-1');
    expect(ownership.getTargetOwner('stranger')).toBeUndefined();
    expect(ownership.getTargetOwner('blank')).toBeUndefined();
    expect(ownership.getTargets('conv-1')).toEqual(['page-1', 'popup-1']);
});

test('the attached event, arriving before the reply, gives the session to whoever is attaching', () => {
    const ownership = createTargetOwnership();
    ownership.expectAttach(CLIENT_B, 'page-2');
    const release = ownership.expectAttach(CLIENT_A, 'page-1');

    ownership.observe(attached('session-1', 'page-1'));
    release();

    expect(ownership.getSessionOriginator('session-1')).toEqual(CLIENT_A);
    expect(ownership.getSessionTarget('session-1')).toBe('page-1');
});

test('two attaches of one target are matched in the order they were sent', () => {
    const ownership = createTargetOwnership();
    ownership.expectAttach({ type: 'daemon' }, 'page-1');
    ownership.expectAttach(CLIENT_A, 'page-1');

    ownership.observe(attached('session-daemon', 'page-1'));
    ownership.observe(attached('session-a', 'page-1'));

    expect(ownership.getSessionOriginator('session-daemon')).toEqual({ type: 'daemon' });
    expect(ownership.getSessionOriginator('session-a')).toEqual(CLIENT_A);
});

test('a released attach that got no event claims nothing later', () => {
    const ownership = createTargetOwnership();
    const release = ownership.expectAttach(CLIENT_A, 'page-1');
    release();

    ownership.observe(attached('session-later', 'page-1'));

    expect(ownership.getSessionOriginator('session-later')).toBeUndefined();
});

test('a child session inherits its parent session originator; an unclaimed parent passes nothing on', () => {
    const ownership = createTargetOwnership();
    ownership.claimSession(CLIENT_A, 'session-1', 'page-1');

    ownership.observe(attached('child-1', 'worker-1', 'session-1'));
    ownership.observe(attached('child-foreign', 'worker-2', 'session-unknown'));

    expect(ownership.getSessionOriginator('child-1')).toEqual(CLIENT_A);
    expect(ownership.getSessionOriginator('child-foreign')).toBeUndefined();
});

test('a top-level attach nobody asked for stays unowned', () => {
    const ownership = createTargetOwnership();
    ownership.claimSession(CLIENT_A, 'session-1', 'page-1');

    ownership.observe(attached('session-foreign', 'page-1'));

    expect(ownership.getSessionOriginator('session-foreign')).toBeUndefined();
});

test('detach forgets the session; destroy forgets the target and its sessions', () => {
    const ownership = createTargetOwnership();
    ownership.claimTarget('conv-1', 'page-1');
    ownership.claimTarget('conv-1', 'page-2');
    ownership.claimSession(CLIENT_A, 'session-1', 'page-1');
    ownership.claimSession(CLIENT_A, 'session-2', 'page-2');
    ownership.claimSession(CLIENT_B, 'session-3', 'page-2');

    ownership.observe({ method: 'Target.detachedFromTarget', params: { sessionId: 'session-1' } });
    ownership.observe({ method: 'Target.targetDestroyed', params: { targetId: 'page-2' } });

    expect(ownership.getSessionOriginator('session-1')).toBeUndefined();
    expect(ownership.getSessionOriginator('session-2')).toBeUndefined();
    expect(ownership.getSessionOriginator('session-3')).toBeUndefined();
    expect(ownership.getTargetOwner('page-2')).toBeUndefined();
    expect(ownership.getTargets('conv-1')).toEqual(['page-1']);
});

test('the last used page follows touches and falls back when it is destroyed', () => {
    const ownership = createTargetOwnership();
    ownership.claimTarget('conv-1', 'page-1');
    ownership.claimTarget('conv-1', 'page-2');
    ownership.claimTarget('conv-2', 'page-3');
    expect(ownership.lastUsed('conv-1')).toBe('page-2');

    ownership.touch('conv-1', 'page-1');
    ownership.touch('conv-1', 'page-3');
    expect(ownership.lastUsed('conv-1')).toBe('page-1');

    ownership.observe({ method: 'Target.targetDestroyed', params: { targetId: 'page-1' } });
    expect(ownership.lastUsed('conv-1')).toBe('page-2');
    expect(ownership.lastUsed('conv-3')).toBeUndefined();
});

function targetCreated(targetId: string, openerId?: string): CdpEvent {
    return { method: 'Target.targetCreated', params: { targetInfo: { targetId, type: 'page', openerId } } };
}

function attached(sessionId: string, targetId: string, parentSessionId?: string): CdpEvent {
    return {
        method: 'Target.attachedToTarget',
        params: { sessionId, targetInfo: { targetId, type: 'page' }, waitingForDebugger: false },
        sessionId: parentSessionId,
    };
}
