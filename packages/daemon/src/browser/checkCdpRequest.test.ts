import path from 'node:path';

import { expect, test } from 'bun:test';

import { checkCdpRequest } from './checkCdpRequest.js';
import type { CdpRequestContext } from './checkCdpRequest.js';
import { createTargetOwnership } from './createTargetOwnership.js';

const DATA_ROOT = '/Users/someone/Poweragents';

/** The client `c1` of conversation `conv-a` owns page `t-a` and session `s-a`; `c2` of `conv-b` owns `t-b`/`s-b`. */
function prepare(): CdpRequestContext {
    const ownership = createTargetOwnership();
    ownership.claimTarget('conv-a', 't-a');
    ownership.claimSession({ type: 'client', clientId: 'c1' }, 's-a', 't-a');
    ownership.claimTarget('conv-b', 't-b');
    ownership.claimSession({ type: 'client', clientId: 'c2' }, 's-b', 't-b');
    // A second client of conv-a (another socket) and the daemon's own session on t-a.
    ownership.claimSession({ type: 'client', clientId: 'c3' }, 's-a3', 't-a');
    ownership.claimSession({ type: 'daemon' }, 's-daemon', 't-a');
    return { clientId: 'c1', conversationId: 'conv-a', ownership, dataRoot: DATA_ROOT };
}

function check(method: string, params?: object, sessionId?: string) {
    return checkCdpRequest({ id: 1, method, params, sessionId }, prepare());
}

test.each(['Page.navigate', 'Network.loadNetworkResource'])('%s goes out only to a web or blank URL', method => {
    expect(check(method, { url: 'https://example.com/', frameId: 'f' }, 's-a')).toEqual({
        type: 'forward',
        method,
        params: { url: 'https://example.com/', frameId: 'f' },
        sessionId: 's-a',
    });
    expect(check(method, { url: 'about:blank' }, 's-a').type).toBe('forward');

    for (const url of [
        'file:///etc/passwd',
        'FILE:///etc/passwd',
        ' file:///etc/passwd',
        'chrome://settings',
        'javascript:alert(1)',
        'data:text/html,x',
        'about:version',
        undefined,
        42,
    ]) {
        expect(check(method, { url }, 's-a')).toMatchObject({ type: 'reject' });
    }
    expect(check(method, {}, 's-a')).toMatchObject({ type: 'reject' });
});

test('Target.createTarget is rebuilt to open minimized in the background, with only the url kept', () => {
    expect(
        check('Target.createTarget', {
            url: 'https://example.com/',
            focus: true,
            hidden: true,
            forTab: true,
            background: false,
            newWindow: false,
            windowState: 'maximized',
            browserContextId: 'ctx',
            left: 0,
            top: 0,
            width: 4000,
            height: 4000,
            enableBeginFrameControl: true,
        }),
    ).toEqual({
        type: 'forward',
        method: 'Target.createTarget',
        params: { url: 'https://example.com/', background: true, newWindow: true, windowState: 'minimized' },
    });
    expect(check('Target.createTarget', {})).toEqual({
        type: 'forward',
        method: 'Target.createTarget',
        params: { url: 'about:blank', background: true, newWindow: true, windowState: 'minimized' },
    });
    for (const url of ['file:///etc/passwd', 'chrome://settings', 'about:blank#x', 42, '']) {
        expect(check('Target.createTarget', { url })).toMatchObject({ type: 'reject' });
    }
});

test('an upload maps agent paths to the data root and asks for staging', () => {
    expect(
        check('DOM.setFileInputFiles', { files: ['/Poweragents/a.pdf', '/Poweragents/p/b.png'], nodeId: 5 }, 's-a'),
    ).toEqual({
        type: 'upload',
        files: [path.join(DATA_ROOT, 'a.pdf'), path.join(DATA_ROOT, 'p/b.png')],
        params: { nodeId: 5 },
        sessionId: 's-a',
    });
});

test.each([
    [['/etc/passwd']],
    [['/Poweragents/../.ssh/id_rsa']],
    [['/Poweragents/ok.txt', '/Users/someone/.ssh/id_rsa']],
    [[42]],
    ['/Poweragents/a.pdf'],
    [undefined],
])('an upload of %p is rejected', files => {
    expect(check('DOM.setFileInputFiles', { files, nodeId: 5 }, 's-a')).toMatchObject({ type: 'reject' });
});

test('a drag carrying files is rejected, a drag without files goes out', () => {
    for (const files of [['/Poweragents/a.txt'], ['/etc/passwd'], '/etc/passwd']) {
        expect(
            check('Input.dispatchDragEvent', { type: 'drop', x: 1, y: 1, data: { items: [], files } }, 's-a'),
        ).toMatchObject({ type: 'reject' });
    }
    for (const data of [{ items: [], files: [] }, { items: [] }]) {
        expect(check('Input.dispatchDragEvent', { type: 'drop', x: 1, y: 1, data }, 's-a').type).toBe('forward');
    }
});

test.each([
    ['Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: '/' }, undefined],
    ['Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: '/' }, 's-a'],
    ['Page.setDownloadBehavior', { behavior: 'allow', downloadPath: '/' }, 's-a'],
    ['Target.createBrowserContext', {}, undefined],
    ['Target.disposeBrowserContext', { browserContextId: 'x' }, undefined],
    ['Target.setAutoAttach', { autoAttach: true, flatten: true }, undefined],
    ['Browser.close', {}, undefined],
    ['Browser.crash', {}, undefined],
    ['Target.exposeDevToolsProtocol', { targetId: 't-a' }, undefined],
    ['Target.attachToBrowserTarget', {}, undefined],
    ['Target.sendMessageToTarget', { message: '{}', sessionId: 's-b' }, undefined],
    ['Browser.grantPermissions', { permissions: ['geolocation'] }, undefined],
    ['Extensions.loadUnpacked', { path: '/tmp/x' }, undefined],
    ['Tracing.start', {}, 's-a'],
    ['Debugger.enable', {}, 's-a'],
    ['Storage.clearDataForOrigin', { origin: '*', storageTypes: 'all' }, 's-a'],
    ['IO.resolveBlob', { objectId: 'x' }, 's-a'],
    ['SystemInfo.getProcessInfo', {}, undefined],
    ['NoSuch.method', {}, 's-a'],
    ['toString', {}, 's-a'],
    ['__proto__.x', {}, 's-a'],
    ['constructor.name', {}, 's-a'],
])('%s is rejected', (method, params, sessionId) => {
    const decision = check(method, params, sessionId);
    expect(decision.type).toBe('reject');
    expect(decision.type === 'reject' && decision.message.includes(method)).toBe(true);
});

test.each(['Fetch.enable', 'Network.enable', 'Runtime.evaluate', 'Page.navigate', 'Storage.getCookies'])(
    '%s with no session is rejected: on the browser target it would reach every page',
    method => {
        expect(check(method, { url: 'https://example.com/' })).toMatchObject({ type: 'reject' });
    },
);

test.each(['s-b', 's-a3', 's-daemon', 'unknown'])('a command on session %p of someone else is rejected', sessionId => {
    expect(check('Runtime.evaluate', { expression: '1' }, sessionId)).toMatchObject({ type: 'reject' });
    expect(check('Target.getTargets', {}, sessionId)).toMatchObject({ type: 'reject' });
});

test('a session-scoped domain command on an own session goes out unchanged', () => {
    expect(check('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, 's-a')).toEqual({
        type: 'forward',
        method: 'Fetch.enable',
        params: { patterns: [{ urlPattern: '*' }] },
        sessionId: 's-a',
    });
    expect(check('Runtime.runIfWaitingForDebugger', undefined, 's-a')).toEqual({
        type: 'forward',
        method: 'Runtime.runIfWaitingForDebugger',
        params: {},
        sessionId: 's-a',
    });
});

test('Target commands naming a target or session pass only for the own conversation', () => {
    expect(check('Target.attachToTarget', { targetId: 't-a', flatten: false })).toEqual({
        type: 'forward',
        method: 'Target.attachToTarget',
        params: { targetId: 't-a', flatten: true },
    });
    expect(check('Target.closeTarget', { targetId: 't-a' }).type).toBe('forward');
    expect(check('Target.getTargetInfo', { targetId: 't-a' }).type).toBe('forward');
    expect(check('Target.getTargetInfo', {}, 's-a').type).toBe('forward');
    expect(check('Target.detachFromTarget', { sessionId: 's-a' })).toEqual({
        type: 'forward',
        method: 'Target.detachFromTarget',
        params: { sessionId: 's-a' },
    });

    for (const targetId of ['t-b', 'unknown', undefined]) {
        expect(check('Target.attachToTarget', { targetId, flatten: true })).toMatchObject({ type: 'reject' });
        expect(check('Target.closeTarget', { targetId })).toMatchObject({ type: 'reject' });
        expect(check('Target.activateTarget', { targetId })).toMatchObject({ type: 'reject' });
    }
    expect(check('Target.getTargetInfo', { targetId: 't-b' })).toMatchObject({ type: 'reject' });
    expect(check('Target.getTargetInfo', {})).toMatchObject({ type: 'reject' });
    for (const sessionId of ['s-b', 's-a3', 's-daemon']) {
        expect(check('Target.detachFromTarget', { sessionId })).toMatchObject({ type: 'reject' });
    }
    expect(check('Target.detachFromTarget', { targetId: 't-a' })).toMatchObject({ type: 'reject' });
});

test('Target.setAutoAttach goes out on an own session, always flattened', () => {
    expect(
        check('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: false }, 's-a'),
    ).toEqual({
        type: 'forward',
        method: 'Target.setAutoAttach',
        params: { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
        sessionId: 's-a',
    });
});

test('the browser-level discovery commands go out', () => {
    expect(check('Target.setDiscoverTargets', { discover: true })).toEqual({
        type: 'forward',
        method: 'Target.setDiscoverTargets',
        params: { discover: true },
    });
    expect(check('Target.getTargets').type).toBe('forward');
    expect(check('Browser.getVersion').type).toBe('forward');
});

test('Page.bringToFront and Target.activateTarget are answered without reaching the browser', () => {
    expect(check('Page.bringToFront', {}, 's-a')).toEqual({ type: 'reply', result: {} });
    expect(check('Target.activateTarget', { targetId: 't-a' })).toEqual({ type: 'reply', result: {} });
    expect(check('Page.bringToFront', {}, 's-b')).toMatchObject({ type: 'reject' });
});

test('Fetch.continueRequest may rewrite a request only to a web URL', () => {
    expect(check('Fetch.continueRequest', { requestId: 'r' }, 's-a').type).toBe('forward');
    expect(check('Fetch.continueRequest', { requestId: 'r', url: 'https://example.com/' }, 's-a').type).toBe('forward');
    expect(check('Fetch.continueRequest', { requestId: 'r', url: 'file:///etc/passwd' }, 's-a')).toMatchObject({
        type: 'reject',
    });
});

test('a malformed message is rejected', () => {
    for (const message of [null, 'Page.navigate', [], { method: 42 }, { params: {} }]) {
        expect(checkCdpRequest(message, prepare())).toMatchObject({ type: 'reject' });
    }
});

test('malformed params or sessionId are rejected', () => {
    expect(checkCdpRequest({ method: 'Runtime.enable', params: [], sessionId: 's-a' }, prepare())).toMatchObject({
        type: 'reject',
    });
    expect(checkCdpRequest({ method: 'Runtime.enable', params: 'x', sessionId: 's-a' }, prepare())).toMatchObject({
        type: 'reject',
    });
    expect(checkCdpRequest({ method: 'Runtime.enable', sessionId: 42 }, prepare())).toMatchObject({ type: 'reject' });
});
