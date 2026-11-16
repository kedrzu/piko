import { defineInterface } from '@nzyme/ioc/Interface.js';

/** One pinned Chrome for Testing build: where to get it, how to verify it and where its executable is once unpacked. */
export interface ChromiumRelease {
    version: string;
    /** Chrome for Testing's platform name (`mac-arm64`); part of the install folder's name. */
    platform: string;
    url: string;
    /** The archive's SHA-256, lowercase hex; nothing that does not match is unpacked. */
    sha256: string;
    /** The executable's path inside the unpacked archive. */
    executable: string;
}

/** Which build the daemon installs on this computer, or `null` when none is pinned for it. */
export interface ChromiumReleaseSource {
    (): ChromiumRelease | null;
}

/**
 * A bump also re-checks the Google Chrome brand (`buildChromeBrand.ts`): read `navigator.userAgentData` brands and
 * `fullVersionList` from installed Google Chrome of the new version and update the test's expected lists if they differ.
 */
const VERSION = '157.0.8103.78';

const PINNED: Record<string, { sha256: string } | undefined> = {
    'mac-arm64': { sha256: 'bf3b49d0fe62a62397e98641aa736ef813c46014f03ec13d4913442e6966c7fc' },
    'mac-x64': { sha256: '8f9590a4e011ba4ea135f50c711f8bf2c7f32b1fac20de68d1b85f010f095ab3' },
};

/** The pinned Chrome for Testing for this computer: macOS only (the archive is unpacked with `ditto`). */
export const getPinnedChromiumRelease: ChromiumReleaseSource = () => {
    if (process.platform !== 'darwin') {
        return null;
    }

    const platform = process.arch === 'arm64' ? 'mac-arm64' : process.arch === 'x64' ? 'mac-x64' : null;
    const pin = platform && PINNED[platform];
    if (!platform || !pin) {
        return null;
    }

    return {
        version: VERSION,
        platform,
        url: `https://storage.googleapis.com/chrome-for-testing-public/${VERSION}/${platform}/chrome-${platform}.zip`,
        sha256: pin.sha256,
        executable: `chrome-${platform}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
    };
};

/** The build the daemon installs; tests register another to serve a small archive. */
export const ChromiumReleases = defineInterface<ChromiumReleaseSource>({
    name: 'ChromiumReleases',
    default: () => getPinnedChromiumRelease,
});
