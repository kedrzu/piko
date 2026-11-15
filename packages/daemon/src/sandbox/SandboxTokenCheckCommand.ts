import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { defineCommand } from '@nzyme/ioc/Command.js';
import { Logger } from '@nzyme/logging/Logger.js';

import { POWERAGENTS_LIMA_HOME } from '../env.js';

/**
 * Whether an `Authorization` header carries the sandbox's bearer token: the one secret the agent's container holds
 * (`POWERAGENTS_BROWSER_TOKEN`), which every daemon port the sandbox reaches requires. Compared in constant time.
 */
export interface SandboxTokenCheckCommandShape {
    (authorization: string | null): Promise<boolean>;
}

/** What `readOrCreatePassword` writes; any other content of the token file is refused. */
const TOKEN_PATTERN = /^[\w-]{32}$/;
const BEARER_PREFIX = 'Bearer ';

/** Checks a request's bearer token against the token file `LimaSandbox` hands to the agent's container. */
export const SandboxTokenCheckCommand = defineCommand({
    name: 'SandboxTokenCheckCommand',
    deps: { logger: Logger, limaHome: POWERAGENTS_LIMA_HOME },
    setup({ logger, limaHome }): SandboxTokenCheckCommandShape {
        // Created by the sandbox, which hands the same token to the agent; only read here.
        const tokenFile = path.join(path.dirname(limaHome), 'browser-token');

        return async authorization => {
            if (authorization?.startsWith(BEARER_PREFIX) !== true) {
                return false;
            }
            const token = await readToken();
            if (token == null) {
                return false;
            }
            const given = Buffer.from(authorization.slice(BEARER_PREFIX.length));
            const expected = Buffer.from(token);
            return given.length === expected.length && timingSafeEqual(given, expected);
        };

        /**
         * Read on every check, since `LimaSandbox` creates the file and may do so after a server starts; `null` while
         * none is usable.
         */
        async function readToken() {
            try {
                const token = await readFile(tokenFile, 'utf8');
                if (TOKEN_PATTERN.test(token)) {
                    return token;
                }
                logger.warn('The sandbox token file holds no valid token');
            } catch (error) {
                logger.warn('The sandbox token could not be read', { error });
            }
            return null;
        }
    },
});
