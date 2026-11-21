import { createLimaDownloadWatcher, LIMA_DOWNLOAD_BYTES } from './createLimaDownloadWatcher.js';
import type { StartProgress, StartProgressStep } from './createStartProgress.js';

/** The id of the step that downloads Lima's image and archive. */
const DOWNLOAD_STEP_ID = 'download';
/** A GUESS of a home connection's download speed, in bytes per ms (10 MB/s); measured speed replaces it once bytes flow. */
const ASSUMED_DOWNLOAD_BYTES_PER_MS = 10_000;
/**
 * The first lines of `limactl start` after `Prepare()` (download, image conversion, disk creation) are the host agent's:
 * `msg="[hostagent] hostagent socket created at …"`, captured from Lima 2.3.0 for both a new and an existing instance.
 */
const PREPARED_LINE = /\bmsg="\[hostagent\] /;

/** Options of {@link createLimaStartProgress}. */
export interface CreateLimaStartProgressOptions {
    progress: StartProgress;
    /** The step that runs once the downloads are done: `bootNewVm`, `startVm` or `restartVm`. */
    step: string;
    /** Whether the plan already has the download step (a new VM), rather than adding it when a download starts. */
    downloadPlanned: boolean;
    /** Lima's cache directory, where the downloads are measured. */
    cacheDir: string;
}

/** Reports one `limactl start` to the start's progress. Never throws: progress is advisory. */
export interface LimaStartProgress {
    /** Feeds one stderr line. */
    push(line: string): void;
    /** Measures the downloads in progress; called on an interval while `limactl start` runs. */
    sample(): Promise<void>;
    /** Marks `limactl start` as returned: the downloads are done even if the marker line never came. */
    end(): void;
}

/**
 * Creates the reporter of one `limactl start`. The download step runs until the first host agent line, as Lima may sit
 * between two downloads with nothing transferring; then `step` begins, or when `limactl start` returns without that line.
 *
 * @__NO_SIDE_EFFECTS__
 */
export function createLimaStartProgress(options: CreateLimaStartProgressOptions): LimaStartProgress {
    const { progress, step } = options;
    const watcher = createLimaDownloadWatcher({ cacheDir: options.cacheDir });
    let downloadTracked = options.downloadPlanned;
    let prepared = false;

    // `step` begins only once the downloads are done, so a download never counts towards its time (and the machine's
    // pace that the tracker derives from it).
    if (downloadTracked) {
        progress.begin(DOWNLOAD_STEP_ID);
    }

    return { push, sample, end };

    function push(line: string) {
        watcher.push(line);
        if (PREPARED_LINE.test(line)) {
            completeDownload();
        }
    }

    async function sample() {
        await watcher.sample();
        if (prepared) {
            return;
        }
        if (!downloadTracked && watcher.downloading) {
            downloadTracked = true;
            progress.addSteps([
                { id: DOWNLOAD_STEP_ID, expectedMs: watcher.bytes.total / ASSUMED_DOWNLOAD_BYTES_PER_MS },
            ]);
            progress.begin(DOWNLOAD_STEP_ID);
        }
        if (downloadTracked && watcher.bytes.total > 0) {
            progress.reportBytes(DOWNLOAD_STEP_ID, watcher.bytes);
        }
    }

    function end() {
        completeDownload();
    }

    function completeDownload() {
        if (prepared) {
            return;
        }
        prepared = true;
        if (downloadTracked) {
            progress.complete(DOWNLOAD_STEP_ID);
        }
        progress.begin(step);
    }
}

/**
 * The download step of a new VM, expected to fetch every file Lima downloads for it at the assumed speed. A warm cache
 * completes it at once.
 *
 * @__NO_SIDE_EFFECTS__
 */
export function getNewVmDownloadStep(): StartProgressStep {
    let bytes = 0;
    for (const size of LIMA_DOWNLOAD_BYTES.values()) {
        bytes += size;
    }
    return { id: DOWNLOAD_STEP_ID, expectedMs: bytes / ASSUMED_DOWNLOAD_BYTES_PER_MS };
}
