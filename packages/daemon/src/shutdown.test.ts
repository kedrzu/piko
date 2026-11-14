import { expect, mock, test } from 'bun:test';

import { createTestLogger } from '@nzyme/logging/createTestLogger.js';

import { shutdown } from './shutdown.js';
import { createStatusResponse } from './statusResponse.js';

test('shutdown completes while an event stream is open, then exits 0', async () => {
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: (request, self) => {
            self.timeout(request, 0);
            return new Response(
                new ReadableStream({ start: controller => controller.enqueue(new TextEncoder().encode('hi')) }),
            );
        },
    });
    const response = await fetch(server.url);
    const reader = response.body?.getReader();
    expect((await reader?.read())?.done).toBe(false);
    const { logger, logs } = createTestLogger('shutdown');
    const exit = mock((_code: number) => undefined);

    await shutdown({ server, logger, signal: 'SIGTERM', exit });

    expect(exit).toHaveBeenCalledWith(0);
    expect(logs.map(log => log.message)).toEqual(['Daemon shutting down']);
});

test('status carries the version only when it is set', async () => {
    expect(await createStatusResponse('1.2.3').json()).toEqual({ status: 'ok', version: '1.2.3' });
    expect(await createStatusResponse(undefined).json()).toEqual({ status: 'ok' });
    expect(await createStatusResponse('').json()).toEqual({ status: 'ok' });
});
