import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * The size of each file `limactl start` downloads, keyed by the description Lima logs for it. Lima logs no size, so
 * these are the `data` files Lima 2.3.0 caches for `buildLimaConfig()` on arm64: the Ubuntu cloud image of the
 * `_images/ubuntu-lts` template and the nerdctl-full archive. Update them with the next Lima bump.
 */
export const LIMA_DOWNLOAD_BYTES = new Map<string, number>([
    ['the image', 940_373_504],
    ['the nerdctl archive', 270_513_423],
]);

/** Where Lima streams a download, under `download/by-url-sha256/<sha256 of the URL>/`, before renaming it to `data`. */
const TEMP_FILE_PREFIX = 'data.tmp.';

/** A logrus text field: `key=value` or `key="quoted value"`. */
const LOG_FIELD = /(\w+)=("(?:[^"\\]|\\.)*"|\S*)/g;
const ATTEMPTING_MESSAGE = /^Attempting to download (.+)$/;
const DOWNLOADED_MESSAGE = /^Downloaded (.+?) from /;
const USING_CACHE_MESSAGE = /^Using cache /;
const CACHE_HASH = /by-url-sha256\/([0-9a-f]{64})\//;

/**
 * Where a download stands:
 * - `pending`: Lima announced it, and no bytes have been seen yet; a cache hit follows within the same instant;
 * - `downloading`: its temporary file exists;
 * - `downloaded` / `cached`: finished, from the network or from Lima's cache.
 */
type LimaDownloadStatus = 'pending' | 'downloading' | 'downloaded' | 'cached';

/** One file `limactl start` fetches. */
interface LimaDownload {
    /** As Lima logs it: `the image`, `the nerdctl archive`. */
    description: string;
    location: string | undefined;
    status: LimaDownloadStatus;
    /** Bytes on disk so far; equals `total` once finished. */
    done: number;
    /** The expected size, or `null` for a description with no known size. */
    total: number | null;
}

/** Options of {@link createLimaDownloadWatcher}. */
export interface CreateLimaDownloadWatcherOptions {
    /** Lima's cache directory: `~/Library/Caches/lima` on macOS (Go's `os.UserCacheDir()`). */
    cacheDir: string;
}

/**
 * Follows the downloads of one `limactl start`. Lima prints no byte progress without a TTY, so the lines say which file
 * is fetched and when it is done, and the size of its temporary file in Lima's cache says how far it got. It never
 * throws: an unknown line is ignored and an unreadable cache leaves the bytes where they were.
 */
export interface LimaDownloadWatcher {
    /** Feeds one line of `limactl start` stderr. */
    push(line: string): void;
    /** Measures the temporary files of the downloads in progress. */
    sample(): Promise<void>;
    /**
     * The bytes over the downloads that went to the network (`downloading` or `downloaded`) and have a known size; a
     * cache hit is not part of it. The total grows when a further download starts; it is 0 before any.
     */
    readonly bytes: { done: number; total: number };
    /** Whether a download is transferring bytes right now. */
    readonly downloading: boolean;
}

interface DownloadState extends LimaDownload {
    /** The sha256 of the location: the name of its directory in Lima's cache. */
    urlHash: string | undefined;
}

/**
 * Creates the watcher of one `limactl start`'s downloads. A download whose cache hit Lima does not log (the nerdctl
 * archive of a new instance) is never announced, so it never appears here.
 *
 * @__NO_SIDE_EFFECTS__
 */
export function createLimaDownloadWatcher(options: CreateLimaDownloadWatcherOptions): LimaDownloadWatcher {
    const downloadRoot = path.join(options.cacheDir, 'download', 'by-url-sha256');
    const downloads: DownloadState[] = [];

    return {
        push,
        sample,
        get bytes() {
            return getBytes();
        },
        get downloading() {
            return downloads.some(download => download.status === 'downloading');
        },
    };

    function push(line: string) {
        const fields = parseLogFields(line);
        const message = fields.get('msg');
        if (message == null) {
            return;
        }

        const attempting = ATTEMPTING_MESSAGE.exec(message);
        if (attempting) {
            startDownload(attempting[1] ?? '', fields.get('location'));
            return;
        }
        const downloaded = DOWNLOADED_MESSAGE.exec(message);
        if (downloaded) {
            const download = findUnfinished(candidate => candidate.description === downloaded[1]);
            if (download) {
                download.status = 'downloaded';
                download.done = download.total ?? download.done;
            }
            return;
        }
        if (USING_CACHE_MESSAGE.test(message)) {
            const hash = CACHE_HASH.exec(message)?.[1];
            const download = findUnfinished(candidate => candidate.urlHash === hash) ?? findUnfinished(() => true);
            if (download) {
                download.status = 'cached';
                download.done = download.total ?? download.done;
            }
        }
    }

    async function sample() {
        await Promise.all(
            downloads
                .filter(download => download.status === 'pending' || download.status === 'downloading')
                .map(sampleDownload),
        );
    }

    /** A new attempt of a description still unfinished replaces it: Lima has given up on that location. */
    function startDownload(description: string, location: string | undefined) {
        const previous = findUnfinished(download => download.description === description);
        const download: DownloadState = {
            description,
            location,
            urlHash: location ? new Bun.CryptoHasher('sha256').update(location).digest('hex') : undefined,
            status: 'pending',
            done: 0,
            total: LIMA_DOWNLOAD_BYTES.get(description) ?? null,
        };
        if (previous) {
            downloads.splice(downloads.indexOf(previous), 1, download);
        } else {
            downloads.push(download);
        }
    }

    /** The newest unfinished download that matches. */
    function findUnfinished(predicate: (download: DownloadState) => boolean) {
        return downloads.findLast(
            download => (download.status === 'pending' || download.status === 'downloading') && predicate(download),
        );
    }

    async function sampleDownload(download: DownloadState) {
        if (download.urlHash == null) {
            return;
        }
        const size = await readTempFileSize(path.join(downloadRoot, download.urlHash));
        // A line may have finished the download while the cache was read.
        if (size == null || (download.status !== 'pending' && download.status !== 'downloading')) {
            return;
        }
        download.status = 'downloading';
        download.done = download.total != null ? Math.min(size, download.total) : size;
    }

    function getBytes() {
        let done = 0;
        let total = 0;
        for (const download of downloads) {
            if (download.total == null || (download.status !== 'downloading' && download.status !== 'downloaded')) {
                continue;
            }
            done += download.done;
            total += download.total;
        }
        return { done, total };
    }
}

/**
 * The size of the newest temporary file in a download's cache directory, or `null` when there is none or the directory
 * cannot be read. A file left by an earlier, killed run is older than the one being written.
 */
async function readTempFileSize(dir: string) {
    try {
        const names = (await readdir(dir)).filter(name => name.startsWith(TEMP_FILE_PREFIX));
        let newest: { size: number; mtimeMs: number } | null = null;
        for (const name of names) {
            const stats = await stat(path.join(dir, name)).catch(() => null);
            if (stats && (newest == null || stats.mtimeMs > newest.mtimeMs)) {
                newest = { size: stats.size, mtimeMs: stats.mtimeMs };
            }
        }
        return newest?.size ?? null;
    } catch {
        return null;
    }
}

/** Reads the fields of a logrus text line (`time="…" level=info msg="…" location="…"`). */
function parseLogFields(line: string) {
    const fields = new Map<string, string>();
    for (const match of line.matchAll(LOG_FIELD)) {
        const key = match[1] ?? '';
        if (!fields.has(key)) {
            fields.set(key, unquote(match[2] ?? ''));
        }
    }
    return fields;
}

/** Logrus quotes a value with Go's `%q`; JSON reads all but its rarer escapes, which are then left as they are. */
function unquote(value: string) {
    if (!value.startsWith('"')) {
        return value;
    }
    try {
        const parsed: unknown = JSON.parse(value);
        return typeof parsed === 'string' ? parsed : value;
    } catch {
        return value.slice(1, -1);
    }
}
