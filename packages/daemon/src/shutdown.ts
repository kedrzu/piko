import type { Logger } from '@nzyme/logging/Logger.js';

/** The server a shutdown stops: the part of `Bun.Server` it uses. */
export interface ShutdownServer {
    stop(closeActiveConnections: boolean): Promise<void>;
}

export interface ShutdownParams {
    server: ShutdownServer;
    logger: Logger;
    /** The signal that asked for the shutdown, for the log. */
    signal: string;
    exit: (code: number) => void;
}

/**
 * Stops the daemon's server and exits 0. Open connections are closed too: the app keeps an event stream open with no
 * timeout, so a plain stop would never finish. The sandbox is deliberately not stopped: the VM and the agent's container
 * keep running, and the next daemon reattaches to them.
 */
export async function shutdown({ server, logger, signal, exit }: ShutdownParams): Promise<void> {
    logger.info('Daemon shutting down', { signal });
    await server.stop(true);
    exit(0);
}
