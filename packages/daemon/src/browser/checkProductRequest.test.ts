import { expect, test } from 'bun:test';

import type { CdpPolicyClient, CdpPolicyResult } from '@nzyme/stealth-browser';

import { checkProductRequest } from './checkProductRequest.js';
import type { ProductClientData } from './checkProductRequest.js';

/** A client of conversation `conv-a`; the package has already checked its sessions and targets. */
const CLIENT: CdpPolicyClient<ProductClientData> = {
    id: 'client-1',
    group: 'conv-a',
    data: { dataRoot: '/Users/someone/Poweragents', uploadsFolder: '/Users/someone/state/browser-uploads' },
    sessionTarget: () => 't-a',
};

test.each(['Page.navigate', 'Network.loadNetworkResource'])('%s goes out only to a web or blank URL', async method => {
    expect(await check(method, { url: 'https://example.com/', frameId: 'f' }, 's-a')).toEqual({
        method,
        params: { url: 'https://example.com/', frameId: 'f' },
        sessionId: 's-a',
    });
    expect(await check(method, { url: 'about:blank' }, 's-a')).not.toHaveProperty('reject');

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
        expect(await check(method, { url }, 's-a')).toHaveProperty('reject');
    }
});

test('Target.createTarget is rebuilt to open minimized in the background, with only the url kept', async () => {
    const expected: CdpPolicyResult = {
        method: 'Target.createTarget',
        params: { url: 'https://example.com/', background: true, newWindow: true, windowState: 'minimized' },
    };
    expect(
        await check('Target.createTarget', {
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
    ).toEqual(expected);
    expect(await check('Target.createTarget', {})).toEqual({
        method: 'Target.createTarget',
        params: { url: 'about:blank', background: true, newWindow: true, windowState: 'minimized' },
    });
    for (const url of ['file:///etc/passwd', 'chrome://settings', 'about:blank#x', 42, '']) {
        expect(await check('Target.createTarget', { url })).toHaveProperty('reject');
    }
});

test.each([
    [['/etc/passwd']],
    [['/Poweragents/../.ssh/id_rsa']],
    [['/Poweragents/ok.txt', '/Users/someone/.ssh/id_rsa']],
    [[42]],
    ['/Poweragents/a.pdf'],
    [undefined],
])('an upload of %p is refused before anything is staged', async files => {
    expect(await check('DOM.setFileInputFiles', { files, nodeId: 5 }, 's-a')).toHaveProperty('reject');
});

test('an upload of a file that cannot be staged is refused with the reason', async () => {
    expect(await check('DOM.setFileInputFiles', { files: ['/Poweragents/missing.pdf'], nodeId: 5 }, 's-a')).toEqual({
        reject: 'DOM.setFileInputFiles: No such file',
    });
});

test('a drag carrying files is refused, a drag without files goes out', async () => {
    for (const files of [['/Poweragents/a.txt'], ['/etc/passwd'], '/etc/passwd']) {
        expect(
            await check('Input.dispatchDragEvent', { type: 'drop', x: 1, y: 1, data: { items: [], files } }, 's-a'),
        ).toHaveProperty('reject');
    }
    for (const data of [{ items: [], files: [] }, { items: [] }]) {
        expect(await check('Input.dispatchDragEvent', { type: 'drop', x: 1, y: 1, data }, 's-a')).not.toHaveProperty(
            'reject',
        );
    }
});

test.each([
    ['Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: '/' }, undefined],
    ['Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: '/' }, 's-a'],
    ['Page.setDownloadBehavior', { behavior: 'allow', downloadPath: '/' }, 's-a'],
    ['Emulation.setUserAgentOverride', { userAgent: 'Agent/1.0' }, 's-a'],
    ['Network.setUserAgentOverride', { userAgent: 'Agent/1.0' }, 's-a'],
    ['Target.createBrowserContext', {}, undefined],
    ['Target.setAutoAttach', { autoAttach: true, flatten: true }, undefined],
    ['Browser.close', {}, undefined],
    ['Browser.grantPermissions', { permissions: ['geolocation'] }, undefined],
    ['Extensions.loadUnpacked', { path: '/tmp/x' }, undefined],
    ['Tracing.start', {}, 's-a'],
    ['Debugger.pause', {}, 's-a'],
    ['Runtime.compileScript', { expression: '1', sourceURL: '', persistScript: true }, 's-a'],
    ['Storage.clearDataForOrigin', { origin: '*', storageTypes: 'all' }, 's-a'],
    ['IO.resolveBlob', { objectId: 'x' }, 's-a'],
    ['SystemInfo.getProcessInfo', {}, undefined],
    ['NoSuch.method', {}, 's-a'],
    ['toString', {}, 's-a'],
    ['__proto__.x', {}, 's-a'],
    ['constructor.name', {}, 's-a'],
])('%s is refused', async (method, params, sessionId) => {
    const result = await check(method, params, sessionId);
    expect('reject' in result && result.reject.includes(method)).toBe(true);
});

test.each(['Fetch.enable', 'Network.enable', 'Runtime.evaluate', 'Page.navigate', 'Storage.getCookies'])(
    '%s with no session is refused: on the browser target it would reach every page',
    async method => {
        expect(await check(method, { url: 'https://example.com/' })).toHaveProperty('reject');
    },
);

test('a session-scoped command and the browser-level discovery commands go out unchanged', async () => {
    expect(await check('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, 's-a')).toEqual({
        method: 'Fetch.enable',
        params: { patterns: [{ urlPattern: '*' }] },
        sessionId: 's-a',
    });
    expect(await check('Target.setDiscoverTargets', { discover: true })).toEqual({
        method: 'Target.setDiscoverTargets',
        params: { discover: true },
    });
    expect(await check('Target.getTargetInfo', { targetId: 't-a' })).not.toHaveProperty('reject');
    expect(await check('Target.getTargetInfo', {}, 's-a')).not.toHaveProperty('reject');
    expect(await check('Target.getTargetInfo', {})).toHaveProperty('reject');
});

test('Page.bringToFront and Target.activateTarget are answered without reaching the browser', async () => {
    expect(await check('Page.bringToFront', {}, 's-a')).toEqual({ reply: {} });
    expect(await check('Target.activateTarget', { targetId: 't-a' })).toEqual({ reply: {} });
});

test('Fetch.continueRequest may rewrite a request only to a web URL', async () => {
    expect(await check('Fetch.continueRequest', { requestId: 'r' }, 's-a')).not.toHaveProperty('reject');
    expect(
        await check('Fetch.continueRequest', { requestId: 'r', url: 'https://example.com/' }, 's-a'),
    ).not.toHaveProperty('reject');
    expect(await check('Fetch.continueRequest', { requestId: 'r', url: 'file:///etc/passwd' }, 's-a')).toHaveProperty(
        'reject',
    );
});

function check(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
    return checkProductRequest(sessionId == null ? { method, params } : { method, params, sessionId }, CLIENT);
}
