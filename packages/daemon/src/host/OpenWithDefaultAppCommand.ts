import { defineCommand } from '@nzyme/ioc/Command.js';
import { Logger } from '@nzyme/logging/Logger.js';

/** What to open. */
export interface OpenWithDefaultAppCommandParams {
    /** An absolute path of a file on this computer, checked by the caller. */
    path: string;
}

/** `unsupported` on a system where the daemon cannot open files yet. */
export type OpenWithDefaultAppCommandResult = 'opened' | 'unsupported';

/**
 * Opens a file in the app the computer opens it with by default, on the computer the daemon runs on (the person's own:
 * the daemon is not in the sandbox). Throws when the file could not be opened.
 */
export interface OpenWithDefaultAppCommandShape {
    (params: OpenWithDefaultAppCommandParams): Promise<OpenWithDefaultAppCommandResult>;
}

/** macOS's `open`, by its full path: a `PATH` the daemon inherited never chooses which program runs. */
const MACOS_OPEN = '/usr/bin/open';

/** Opens a file with macOS's `open`; other systems are not supported yet. */
export const OpenWithDefaultAppCommand = defineCommand({
    name: 'OpenWithDefaultAppCommand',
    deps: { logger: Logger },
    setup({ logger }): OpenWithDefaultAppCommandShape {
        return async ({ path }) => {
            if (process.platform !== 'darwin') {
                logger.info('Opening files in their default app is not supported here', { platform: process.platform });
                return 'unsupported';
            }
            // Arguments, never a shell: the path is passed as it is, whatever characters it holds. `--` ends the
            // options, so a path is never read as one.
            const child = Bun.spawn([MACOS_OPEN, '--', path], {
                stdin: 'ignore',
                stdout: 'ignore',
                stderr: 'pipe',
            });
            const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
            if (exitCode !== 0) {
                throw new Error(`open exited with ${exitCode}: ${stderr.trim()}`);
            }
            return 'opened';
        };
    },
});
