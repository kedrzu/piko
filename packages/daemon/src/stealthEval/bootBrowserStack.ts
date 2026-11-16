import path from 'node:path';

import { createContainer } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { consoleLog, LoggerTransport } from '@nzyme/logging/LoggerTransport.js';
import { assert } from '@nzyme/utils/assert.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';
import { withTimeout } from '@nzyme/utils/withTimeout.js';

import { BrowserNetworkGuard } from '../browser/BrowserNetworkGuard.js';
import { BrowserLaunch, BrowserService } from '../browser/BrowserService.js';
import { BrowserTunnelService } from '../browser/BrowserTunnelService.js';
import { ChromiumInstall } from '../browser/ChromiumInstall.js';
import { readOrCreatePassword } from '../sandbox/readOrCreatePassword.js';

/** The daemon's browser stack running for the eval: what agent-browser needs to reach it, and how to stop it. */
export interface BrowserStack {
    /** The loopback port of the browser tunnel. */
    port: number;
    /** The bearer token the tunnel accepts. */
    token: string;
    /** The conversation the eval's pages belong to: an OpenCode-shaped session id, as the tunnel requires. */
    conversationId: string;
    /** The browser's product and version, starting the browser if it is not running yet. */
    browserVersion(): Promise<string>;
    /** Closes the tunnel, the browser and the proxy. */
    stop(): Promise<void>;
}

/** How long the browser gets to close by itself before it is killed. */
const CLOSE_TIMEOUT_MS = 10_000;

/**
 * Boots the daemon's own browser stack (network guard, Chrome for Testing, tunnel) in a container of its own, with
 * every path the stack reads under `stateFolder`: Chromium installs into `stateFolder/chromium`, the profile and the
 * token file live there too, so the person's poweragents state is never touched. The browser launches exactly as the
 * daemon launches it; only the proxy and tunnel ports are free ones, so a running daemon does not collide.
 */
export async function bootBrowserStack(stateFolder: string): Promise<BrowserStack> {
    const container = createContainer();
    // Debug entries (every CDP routing decision) would bury what the eval prints itself.
    container.set(LoggerTransport, (logger, level, message, obj) => {
        if (level !== 'debug' && level !== 'trace') {
            consoleLog(logger, level, message, obj);
        }
    });
    container.set(EnvVariables, {
        POWERAGENTS_LIMA_HOME: path.join(stateFolder, 'lima'),
        POWERAGENTS_DATA_ROOT: path.join(stateFolder, 'data'),
    });

    // The token file sits where `SandboxTokenCheckCommand` reads it: beside Lima's home.
    const token = await readOrCreatePassword(path.join(stateFolder, 'browser-token'));

    const install = container.resolve(ChromiumInstall);
    await install.ensure();
    assert(install.getExecutable(), 'Chrome for Testing is installed');

    const proxy = await container.resolve(BrowserNetworkGuard).listen(0);
    container.set(BrowserLaunch, { proxyPort: proxy.port, extraArgs: [] });
    const browser = container.resolve(BrowserService);
    await browser.ensureDownloadsFolder();
    const tunnel = container.resolve(BrowserTunnelService).listen(0);

    return {
        port: tunnel.port,
        token,
        conversationId: `ses_stealtheval${Date.now().toString(36)}`,
        browserVersion,
        stop,
    };

    async function browserVersion() {
        await browser.start();
        const version = await browser.send('Browser.getVersion');
        const product = isPlainObject(version) ? version['product'] : undefined;
        if (typeof product !== 'string') {
            throw new TypeError('Browser.getVersion gave no product');
        }
        return product;
    }

    async function stop() {
        await tunnel.close();
        if (browser.isRunning()) {
            const exited = new Promise<void>(resolve => {
                browser.exited.on(() => resolve());
            });
            // `Browser.close` lets Chrome flush the profile; the reply may never come, since the pipe closes with it.
            void browser.send('Browser.close').catch(() => undefined);
            await withTimeout({
                operation: exited,
                timeoutMs: CLOSE_TIMEOUT_MS,
                onTimeout: () => {
                    throw new Error('The browser did not close');
                },
            });
        }
        await proxy.close();
    }
}
