import { existsSync } from 'node:fs';
import { chmod, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const VERSION = '0.43.0';

/**
 * The macOS builds of the agent-browser release the sandbox image pins (`packages/daemon/sandbox/agent.Containerfile`
 * installs the Linux ones), by `process.arch`, with their SHA-256 as the release lists them.
 */
const PINNED: Record<string, { target: string; sha256: string } | undefined> = {
    arm64: { target: 'darwin-arm64', sha256: '05338a8eeddf0b3f9ebf0c87a6c21aedc10685608c68618e1a8483c43eae9c3f' },
    x64: { target: 'darwin-x64', sha256: '49a5ab27297213c1bc0005701a6a4542399abfc9d2cb7520ab519ebb94b8b13d' },
};

/**
 * Downloads the pinned agent-browser into `stateFolder` unless it is there, verifies its checksum, and resolves with the
 * executable's path. A download that does not match the pin is removed and never made executable.
 */
export async function installAgentBrowser(stateFolder: string): Promise<string> {
    const pin = process.platform === 'darwin' ? PINNED[process.arch] : undefined;
    if (!pin) {
        throw new Error(`No agent-browser is pinned for ${process.platform}-${process.arch}`);
    }

    const folder = path.join(stateFolder, 'agent-browser', VERSION);
    const executable = path.join(folder, 'agent-browser');
    if (existsSync(executable)) {
        return executable;
    }

    await mkdir(folder, { recursive: true });
    const url = `https://github.com/vercel-labs/agent-browser/releases/download/v${VERSION}/agent-browser-${pin.target}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`agent-browser download failed: HTTP ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const actual = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
    if (actual !== pin.sha256) {
        throw new Error(`agent-browser download does not match the pinned checksum (got ${actual})`);
    }

    // Written aside and renamed, so a half-written file never passes for an installed one.
    const partial = `${executable}.partial`;
    try {
        await Bun.write(partial, bytes);
        await chmod(partial, 0o755);
        await rename(partial, executable);
    } finally {
        await rm(partial, { force: true });
    }
    return executable;
}
