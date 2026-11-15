import { afterAll, expect, test } from 'bun:test';

import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

import { OpencodeConnection } from './OpencodeConnection.js';
import { OpencodeSessionInboxListCommand } from './OpencodeSessionInboxListCommand.js';
import type { OpencodeInboxItem } from './OpencodeSessionInboxListCommand.js';
import type { components } from './schema.gen.js';

type VendorInboxItem = components['schemas']['Session.Inbox.Info'];

// A stand-in OpenCode server on the loopback: an inbox with a prompt, synthetic input and one of OpenCode's own items.
const inbox: VendorInboxItem[] = [
    {
        id: 'msg_1',
        sessionID: 'ses_1',
        time: { created: 1 },
        type: 'user',
        payload: { text: 'Posortuj maile', skills: [{ id: 'gmail:read-mail', name: 'Read mail' }] },
        delivery: 'queue',
    },
    {
        id: 'msg_2',
        sessionID: 'ses_1',
        time: { created: 2 },
        type: 'compaction',
        payload: {},
        delivery: 'queue',
    },
    {
        id: 'msg_3',
        sessionID: 'ses_1',
        time: { created: 3 },
        type: 'synthetic',
        payload: { text: 'Plugin installed', metadata: { plugin: 'gmail' } },
        delivery: 'queue',
    },
];
const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    routes: { '/api/session/ses_1/inbox': () => Response.json({ data: inbox }) },
});

afterAll(() => server.stop(true));

test("lists the waiting prompts and synthetic input with their metadata, leaving out OpenCode's own items", async () => {
    const { container } = createTestContainer();
    container.set(OpencodeConnection, {
        getEndpoint: () => ({ url: server.url.origin, username: 'opencode', password: 'pw' }),
    });

    const items = await container.resolve(OpencodeSessionInboxListCommand)('ses_1');

    const expected: OpencodeInboxItem[] = [
        { type: 'prompt', id: 'msg_1', createdAt: 1, text: 'Posortuj maile' },
        { type: 'synthetic', id: 'msg_3', createdAt: 3, text: 'Plugin installed', metadata: { plugin: 'gmail' } },
    ];
    expect(items).toEqual(expected);
});
