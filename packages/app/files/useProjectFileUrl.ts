import { useLogger } from '@nzyme/vue-ioc/useLogger.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import { reactive } from '@nzyme/vue-utils/reactivity/reactive.js';
import { isTauri } from '@tauri-apps/api/core';
import { onScopeDispose, ref, toValue, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import { ProjectFileContentEndpoint } from '@poweragents/common/api/ProjectFileContentEndpoint.js';
import { ProjectFileLocateEndpoint } from '@poweragents/common/api/ProjectFileLocateEndpoint.js';
import { fileExtension } from '@poweragents/common/utils/fileExtension.js';

import { DaemonClient } from '@/daemon/DaemonClient.js';
import { toLocalFileUrl } from '@/utils/toLocalFileUrl.js';

export interface UseProjectFileUrlOptions {
    projectId: MaybeRefOrGetter<string>;
    path: MaybeRefOrGetter<string>;
    /** The file's last change: a new one loads the file again. */
    updatedAt: MaybeRefOrGetter<number | null>;
    /** Only an image or a PDF is loaded; off, nothing is asked for. */
    enabled: MaybeRefOrGetter<boolean>;
}

export interface ProjectFileUrlViewModel {
    /** Where the page loads the file from; `undefined` while it is being found, or when it cannot be. */
    readonly src: string | undefined;
    /** The file could not be loaded: over 25 MiB, gone, or the daemon did not answer. */
    readonly failed: boolean;
    /** The file did not load from `src`: it is loaded from its bytes instead. */
    fallback(): void;
}

/** The types the page is told the bytes are: an image or a PDF the app previews. */
const MIME_TYPES: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
};

/**
 * An address the page shows a project's image or PDF from: in the desktop app the file itself, by its path through the
 * shell's asset protocol; in a plain browser, or when the asset protocol refuses it, an object URL of its bytes read
 * from the daemon. An object URL is revoked once the file changes, another is shown, or the screen closes.
 */
export function useProjectFileUrl(options: UseProjectFileUrlOptions): ProjectFileUrlViewModel {
    const daemon = useService(DaemonClient);
    const logger = useLogger();

    const src = ref<string>();
    const failed = ref(false);
    /** Counts loads, so an older answer never replaces a newer one. */
    let seq = 0;
    let objectUrl: string | undefined;

    watch(
        [
            () => toValue(options.projectId),
            () => toValue(options.path),
            () => toValue(options.updatedAt),
            () => toValue(options.enabled),
        ],
        () => void load(),
        { immediate: true },
    );
    onScopeDispose(() => {
        seq++;
        revoke();
    });

    return reactive<ProjectFileUrlViewModel>({ src, failed, fallback });

    function fallback() {
        if (objectUrl === undefined) {
            void loadBytes(++seq);
        }
    }

    async function load() {
        const current = ++seq;
        revoke();
        src.value = undefined;
        failed.value = false;
        if (!toValue(options.enabled)) {
            return;
        }
        const url = isTauri() ? await locate(current) : undefined;
        if (current !== seq) {
            return;
        }
        if (url !== undefined) {
            src.value = url;
            return;
        }
        await loadBytes(current);
    }

    /** The asset protocol's address of the file, if it serves it: an `<iframe>` does not report a refused load. */
    async function locate(current: number) {
        const input = { projectId: toValue(options.projectId), path: toValue(options.path) };
        try {
            const located = await daemon(ProjectFileLocateEndpoint, input);
            const url = 'path' in located ? toLocalFileUrl(located.path) : undefined;
            if (url === undefined || current !== seq) {
                return undefined;
            }
            const controller = new AbortController();
            const response = await fetch(url, { signal: controller.signal });
            // Only whether it is served matters, not the bytes.
            controller.abort();
            return response.ok ? url : undefined;
        } catch (error) {
            logger.info('Project file not served by the asset protocol, read as bytes', { ...input, error });
            return undefined;
        }
    }

    async function loadBytes(current: number) {
        const projectId = toValue(options.projectId);
        const path = toValue(options.path);
        try {
            const result = await daemon(ProjectFileContentEndpoint, { projectId, path });
            if (current !== seq) {
                return;
            }
            if (!('base64' in result)) {
                logger.warn('Project file not read as bytes', { projectId, path, result });
                failed.value = true;
                return;
            }
            // `atob` gives one character per byte.
            const bytes = Uint8Array.from(atob(result.base64), char => char.codePointAt(0) ?? 0);
            revoke();
            objectUrl = URL.createObjectURL(new Blob([bytes], { type: MIME_TYPES[fileExtension(path)] ?? '' }));
            src.value = objectUrl;
        } catch (error) {
            if (current === seq) {
                logger.warn('Project file could not be read as bytes', { projectId, path, error });
                failed.value = true;
            }
        }
    }

    function revoke() {
        if (objectUrl !== undefined) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = undefined;
        }
    }
}
