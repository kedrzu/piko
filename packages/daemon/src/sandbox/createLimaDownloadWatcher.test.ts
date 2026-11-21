import { chmod, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { createLimaDownloadWatcher } from './createLimaDownloadWatcher.js';

const cacheDirs: string[] = [];

afterEach(async () => {
    await Promise.all(cacheDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

const IMAGE_BYTES = 940_373_504;
const NERDCTL_BYTES = 270_513_423;
const IMAGE_URL =
    'https://cloud-images.ubuntu.com/releases/resolute/release-20261016/ubuntu-26.04-server-cloudimg-arm64.img';
const NERDCTL_URL =
    'https://github.com/containerd/nerdctl/releases/download/v2.4.2/nerdctl-full-2.4.2-linux-arm64.tar.gz';

// Captured verbatim from `limactl start --tty=false` (Lima 2.3.0) with a warm cache.
const IMAGE_ATTEMPTING = `time="2026-11-21T16:59:57+01:00" level=info msg="Attempting to download the image" arch=aarch64 digest="sha256:8eb876c2ccc4b6ff89e4a65d511815923b285e04503ba465809bf587f763da24" location="${IMAGE_URL}"`;
const IMAGE_USING_CACHE =
    'time="2026-11-21T16:59:57+01:00" level=info msg="Using cache `/Users/kedrzu/Library/Caches/lima/download/by-url-sha256/274d59968f7fc4016d852a0fa9a95e78a7253670ae8095bcb06076eec1f922f8/imgconv/raw`"';
const UNRELATED_LINE =
    'time="2026-11-21T16:59:57+01:00" level=info msg="Starting the instance `p` with internal VM driver `vz`"';

// Not captured (the cache was warm): built from the format strings of Lima's `fileutils.DownloadFile`.
const IMAGE_DOWNLOADED = `time="2026-11-21T16:59:58+01:00" level=info msg="Downloaded the image from \`${IMAGE_URL}\`"`;
const NERDCTL_ATTEMPTING = `time="2026-11-21T16:59:59+01:00" level=info msg="Attempting to download the nerdctl archive" arch=aarch64 digest="sha256:0000000000000000000000000000000000000000000000000000000000000000" location="${NERDCTL_URL}"`;

test('measures a download from its temporary file, then reports it whole once Lima says it is downloaded', async () => {
    const cacheDir = await createCacheDir();
    const watcher = createLimaDownloadWatcher({ cacheDir });

    watcher.push(IMAGE_ATTEMPTING);
    await writeTempFile(cacheDir, IMAGE_URL, 'data.tmp.123.1', 1_000);
    await watcher.sample();

    expect(watcher.bytes).toEqual({ done: 1_000, total: IMAGE_BYTES });
    expect(watcher.downloading).toBe(true);

    watcher.push(IMAGE_DOWNLOADED);

    expect(watcher.bytes).toEqual({ done: IMAGE_BYTES, total: IMAGE_BYTES });
    expect(watcher.downloading).toBe(false);
});

test('sums the image and the nerdctl archive once the second download starts', async () => {
    const cacheDir = await createCacheDir();
    const watcher = createLimaDownloadWatcher({ cacheDir });

    watcher.push(IMAGE_ATTEMPTING);
    watcher.push(IMAGE_DOWNLOADED);
    watcher.push(NERDCTL_ATTEMPTING);
    await writeTempFile(cacheDir, NERDCTL_URL, 'data.tmp.123.2', 5_000);
    await watcher.sample();

    expect(watcher.bytes).toEqual({ done: IMAGE_BYTES + 5_000, total: IMAGE_BYTES + NERDCTL_BYTES });
});

test('reads the newest temporary file, not one left by an earlier run', async () => {
    const cacheDir = await createCacheDir();
    const watcher = createLimaDownloadWatcher({ cacheDir });

    watcher.push(IMAGE_ATTEMPTING);
    await writeTempFile(cacheDir, IMAGE_URL, 'data.tmp.99.1', 9_000, new Date(Date.now() - 60_000));
    await writeTempFile(cacheDir, IMAGE_URL, 'data.tmp.123.1', 2_000);
    await watcher.sample();

    expect(watcher.bytes.done).toBe(2_000);
});

test('takes a cache hit out of the bytes', async () => {
    const cacheDir = await createCacheDir();
    const watcher = createLimaDownloadWatcher({ cacheDir });

    watcher.push(IMAGE_ATTEMPTING);
    watcher.push(IMAGE_USING_CACHE);
    await watcher.sample();

    expect(watcher.bytes).toEqual({ done: 0, total: 0 });
    expect(watcher.downloading).toBe(false);
});

test('keeps an unknown description with no size, out of the bytes', async () => {
    const cacheDir = await createCacheDir();
    const watcher = createLimaDownloadWatcher({ cacheDir });
    const url = 'https://example.com/kernel';

    watcher.push(`time="x" level=info msg="Attempting to download the kernel" location="${url}"`);
    await writeTempFile(cacheDir, url, 'data.tmp.1.1', 700);
    await watcher.sample();

    expect(watcher.bytes).toEqual({ done: 0, total: 0 });
    expect(watcher.downloading).toBe(true);
});

test('ignores garbage and unrelated lines', () => {
    const watcher = createLimaDownloadWatcher({ cacheDir: '/nonexistent' });

    for (const line of [
        UNRELATED_LINE,
        '',
        'garbage',
        'msg="unterminated',
        'msg=Downloaded',
        '{"msg":"x"}',
        IMAGE_USING_CACHE,
    ]) {
        watcher.push(line);
    }

    expect(watcher.bytes).toEqual({ done: 0, total: 0 });
    expect(watcher.downloading).toBe(false);
});

test('leaves the bytes where they were when the cache is missing or unreadable', async () => {
    const missing = createLimaDownloadWatcher({ cacheDir: path.join(tmpdir(), 'no-such-lima-cache') });
    missing.push(IMAGE_ATTEMPTING);
    await missing.sample();
    expect(missing.bytes).toEqual({ done: 0, total: 0 });
    expect(missing.downloading).toBe(false);

    const cacheDir = await createCacheDir();
    const watcher = createLimaDownloadWatcher({ cacheDir });
    watcher.push(IMAGE_ATTEMPTING);
    const dir = await writeTempFile(cacheDir, IMAGE_URL, 'data.tmp.123.1', 3_000);
    await watcher.sample();
    await chmod(dir, 0o000);
    try {
        await watcher.sample();
    } finally {
        await chmod(dir, 0o700);
    }

    expect(watcher.bytes.done).toBe(3_000);
});

async function createCacheDir() {
    const dir = await mkdtemp(path.join(tmpdir(), 'lima-cache-'));
    cacheDirs.push(dir);
    return dir;
}

async function writeTempFile(cacheDir: string, url: string, name: string, size: number, mtime?: Date) {
    const hash = new Bun.CryptoHasher('sha256').update(url).digest('hex');
    const dir = path.join(cacheDir, 'download', 'by-url-sha256', hash);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, name);
    await writeFile(file, new Uint8Array(size));
    if (mtime) {
        await utimes(file, mtime, mtime);
    }
    return dir;
}
