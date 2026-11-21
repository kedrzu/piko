import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { createLimaStartProgress, getNewVmDownloadStep } from './createLimaStartProgress.js';
import { createStartProgress } from './createStartProgress.js';

const cacheDirs: string[] = [];

afterEach(async () => {
    await Promise.all(cacheDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

const IMAGE_BYTES = 940_373_504;
const IMAGE_URL =
    'https://cloud-images.ubuntu.com/releases/resolute/release-20261016/ubuntu-26.04-server-cloudimg-arm64.img';

// Captured verbatim from `limactl start --tty=false` (Lima 2.3.0) with a warm cache.
const IMAGE_ATTEMPTING = `time="2026-11-21T17:05:13+01:00" level=info msg="Attempting to download the image" arch=aarch64 digest="sha256:8eb876c2ccc4b6ff89e4a65d511815923b285e04503ba465809bf587f763da24" location="${IMAGE_URL}"`;
const IMAGE_USING_CACHE =
    'time="2026-11-21T17:05:13+01:00" level=info msg="Using cache `/Users/kedrzu/Library/Caches/lima/download/by-url-sha256/274d59968f7fc4016d852a0fa9a95e78a7253670ae8095bcb06076eec1f922f8/imgconv/raw`"';
const RESIZE_DISK =
    'time="2026-11-21T17:05:13+01:00" level=info msg="Resize instance cap\'s disk from 3.5GiB to 100GiB"';
const HOST_AGENT_FIRST =
    'time="2026-11-21T17:05:14+01:00" level=info msg="[hostagent] hostagent socket created at /private/tmp/lp.qB74/h/cap/ha.sock"';

const BOOT_MS = 45_000;

test('keeps the download step through a pause in downloading, until the host agent starts', async () => {
    const progress = createStartProgress({ now: () => 0 });
    progress.addSteps([getNewVmDownloadStep(), { id: 'bootNewVm', expectedMs: BOOT_MS }]);
    const lima = createLimaStartProgress({
        progress,
        step: 'bootNewVm',
        downloadPlanned: true,
        cacheDir: await createCacheDir(),
    });

    lima.push(IMAGE_ATTEMPTING);
    lima.push(IMAGE_USING_CACHE);
    lima.push(RESIZE_DISK);
    await lima.sample();
    expect(progress.snapshot()?.remainingMs).toBe(Math.round(getNewVmDownloadStep().expectedMs + BOOT_MS));

    lima.push(HOST_AGENT_FIRST);
    expect(progress.snapshot()?.remainingMs).toBe(BOOT_MS);
});

test('adds a download to the start of an existing VM once bytes flow, and starts the VM step only after it', async () => {
    const cacheDir = await createCacheDir();
    let now = 0;
    const progress = createStartProgress({ now: () => now });
    progress.addSteps([{ id: 'startVm', expectedMs: 15_000 }]);
    const lima = createLimaStartProgress({ progress, step: 'startVm', downloadPlanned: false, cacheDir });

    lima.push(IMAGE_ATTEMPTING);
    await lima.sample();
    expect(progress.snapshot()?.remainingMs).toBe(15_000);

    await writeTempFile(cacheDir, IMAGE_URL, 1_000);
    await lima.sample();
    now = 10_000;
    // No transfer speed yet: the bytes left at the assumed 10 MB/s; `startVm` waits whole, its time not running.
    expect(progress.snapshot()?.remainingMs).toBe(Math.round(15_000 + (IMAGE_BYTES - 1_000) / 10_000));

    lima.push(HOST_AGENT_FIRST);
    now = 14_000;
    expect(progress.snapshot()?.remainingMs).toBe(11_000);
});

test('completes the download when limactl returns without a host agent line', async () => {
    const progress = createStartProgress({ now: () => 0 });
    progress.addSteps([getNewVmDownloadStep(), { id: 'bootNewVm', expectedMs: BOOT_MS }]);
    const lima = createLimaStartProgress({
        progress,
        step: 'bootNewVm',
        downloadPlanned: true,
        cacheDir: await createCacheDir(),
    });

    lima.end();

    expect(progress.snapshot()?.remainingMs).toBe(BOOT_MS);
});

async function createCacheDir() {
    const dir = await mkdtemp(path.join(tmpdir(), 'piko-lima-start-'));
    cacheDirs.push(dir);
    return dir;
}

async function writeTempFile(cacheDir: string, url: string, size: number) {
    const hash = new Bun.CryptoHasher('sha256').update(url).digest('hex');
    const dir = path.join(cacheDir, 'download', 'by-url-sha256', hash);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'data.tmp.123.1'), new Uint8Array(size));
}
