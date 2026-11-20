import path from 'node:path';

import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { findChromeForTesting, installChromeForTesting } from '@nzyme/stealth-browser';

import { PIKO_LIMA_HOME } from '../env.js';
import { removeOtherVersions } from './removeOtherVersions.js';

/**
 * The agent's own Chromium: the Chrome for Testing `@nzyme/stealth-browser` pins, which the daemon downloads on first
 * start, like the sandbox's image, so the installer carries no browser. It lives in `chromium/<version>-<platform>/`
 * beside Lima's home; that folder exists only once a verified archive is fully unpacked.
 */
export interface ChromiumInstallShape {
    /**
     * Downloads, verifies and unpacks the pinned build unless it is installed, then removes every other version. Calls
     * made meanwhile join the running install. A failure rejects and is logged; the next call starts over. Does nothing
     * off macOS.
     */
    ensure(): Promise<void>;
    /** The browser's executable once installed; `null` while it is not (or off macOS). */
    getExecutable(): string | null;
}

export const ChromiumInstall = defineService({
    name: 'ChromiumInstall',
    deps: { logger: Logger, limaHome: PIKO_LIMA_HOME },
    setup({ logger, limaHome }): ChromiumInstallShape {
        const cacheDir = path.join(path.dirname(limaHome), 'chromium');

        return { ensure, getExecutable };

        async function ensure() {
            if (!isSupported()) {
                logger.info('No Chromium is pinned for this computer, the agent gets no browser');
                return;
            }
            if (getExecutable() != null) {
                return;
            }

            try {
                const { executablePath } = await installChromeForTesting({ cacheDir, logger });
                await removeOtherVersions(cacheDir, executablePath);
            } catch (error) {
                logger.error('Chromium failed to install', { error });
                throw error;
            }
        }

        function getExecutable() {
            return isSupported() ? findChromeForTesting({ cacheDir }) : null;
        }
    },
});

/** The daemon gives the agent a browser on macOS only. */
function isSupported() {
    return process.platform === 'darwin';
}
