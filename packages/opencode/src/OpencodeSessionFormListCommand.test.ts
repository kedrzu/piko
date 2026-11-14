import { afterAll, expect, test } from 'bun:test';

import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

import { OpencodeConnection } from './OpencodeConnection.js';
import { OpencodeSessionFormListCommand } from './OpencodeSessionFormListCommand.js';

// A stand-in OpenCode server on the loopback: one session with a pending form, one without, the rest unknown.
const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    routes: {
        '/api/session/ses_asking/form': () =>
            Response.json({ data: [{ id: 'frm_1', sessionID: 'ses_asking', title: 'Which one?', fields: [] }] }),
        '/api/session/ses_quiet/form': () => Response.json({ data: [] }),
    },
    fetch: () => Response.json({ _tag: 'SessionNotFoundError' }, { status: 404 }),
});

afterAll(() => server.stop(true));

test('answers about the given session only, and null for a missing one', async () => {
    const { container } = createTestContainer();
    container.set(OpencodeConnection, {
        getEndpoint: () => ({ url: server.url.origin, username: 'opencode', password: 'pw' }),
    });
    const hasPendingForm = container.resolve(OpencodeSessionFormListCommand);

    expect(await hasPendingForm('ses_asking')).toBe(true);
    expect(await hasPendingForm('ses_quiet')).toBe(false);
    expect(await hasPendingForm('ses_missing')).toBeNull();
});
