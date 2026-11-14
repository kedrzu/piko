import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';

import type { AiProvider } from '@poweragents/common/api/AiTypes.js';

import { POWERAGENTS_LIMA_HOME } from '../env.js';
import { isErrorCode } from '../utils/isErrorCode.js';

/**
 * The provider of the last sign-in that connected the agent, kept across daemon restarts in `ai-provider.json` beside
 * the daemon's other state (the folder above `POWERAGENTS_LIMA_HOME`), readable by its owner only.
 */
export interface ActiveProviderStoreShape {
    /** The recorded provider; `undefined` when there is no record or the file holds none this store wrote. */
    get(): Promise<AiProvider | undefined>;
    /** Records the provider; written only when a sign-in has connected the agent. */
    set(provider: AiProvider): Promise<void>;
}

/** What the file holds. */
interface ActiveProviderRecord {
    provider: AiProvider;
}

/** The active AI provider, kept in a file. */
export const ActiveProviderStore = defineService({
    name: 'ActiveProviderStore',
    deps: { limaHome: POWERAGENTS_LIMA_HOME, logger: Logger },
    setup({ limaHome, logger }): ActiveProviderStoreShape {
        const filePath = path.join(path.dirname(limaHome), 'ai-provider.json');

        return { get, set };

        async function get() {
            const text = await readFile(filePath, 'utf8').catch((error: unknown) => {
                if (isErrorCode(error, 'ENOENT')) {
                    return undefined;
                }
                throw error;
            });
            if (text === undefined) {
                return undefined;
            }

            const provider = parseProvider(text);
            if (provider === undefined) {
                logger.warn('Active provider record unreadable, ignored');
            }
            return provider;
        }

        async function set(provider: AiProvider) {
            await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
            const record: ActiveProviderRecord = { provider };
            // `mode` applies only when the file is created; `chmod` tightens one created looser.
            await writeFile(filePath, JSON.stringify(record), { mode: 0o600 });
            await chmod(filePath, 0o600);
            logger.info('Active provider recorded', { provider });
        }
    },
});

function parseProvider(text: string): AiProvider | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return undefined;
    }

    if (typeof parsed !== 'object' || parsed === null || !('provider' in parsed)) {
        return undefined;
    }

    switch (parsed.provider) {
        case 'claude':
        case 'chatgpt':
            return parsed.provider;
        default:
            return undefined;
    }
}
