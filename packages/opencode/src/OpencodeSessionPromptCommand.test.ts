import { afterAll, expect, test } from 'bun:test';

import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

import { OpencodeConnection } from './OpencodeConnection.js';
import { OpencodeSessionPromptCommand } from './OpencodeSessionPromptCommand.js';
import type { components } from './schema.gen.js';

type VendorReceipt = components['schemas']['Session.Inbox.User'];

// A stand-in OpenCode server on the loopback, recording the prompt bodies it is sent.
const bodies: unknown[] = [];
const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    routes: {
        '/api/session/ses_1/prompt': {
            POST: async request => {
                bodies.push(await request.json());
                const receipt: VendorReceipt = {
                    id: 'msg_1',
                    sessionID: 'ses_1',
                    time: { created: 7 },
                    type: 'user',
                    payload: { text: 'Posortuj maile' },
                    delivery: 'queue',
                };
                return Response.json({ data: receipt });
            },
        },
    },
});

afterAll(() => server.stop(true));

test('attaches skills by id and passes resume on; a plain prompt carries neither', async () => {
    const { container } = createTestContainer();
    container.set(OpencodeConnection, {
        getEndpoint: () => ({ url: server.url.origin, username: 'opencode', password: 'pw' }),
    });
    const prompt = container.resolve(OpencodeSessionPromptCommand);

    const receipt = await prompt({
        sessionId: 'ses_1',
        text: 'Posortuj maile',
        skills: ['gmail:read-mail'],
        resume: false,
    });
    await prompt({ sessionId: 'ses_1', text: 'Dzięki' });

    expect(receipt).toEqual({ messageId: 'msg_1', admittedAt: 7 });
    expect(bodies).toEqual([
        { text: 'Posortuj maile', skills: [{ id: 'gmail:read-mail' }], resume: false },
        { text: 'Dzięki' },
    ]);
});

test('passes metadata along with the prompt', async () => {
    const { container } = createTestContainer();
    container.set(OpencodeConnection, {
        getEndpoint: () => ({ url: server.url.origin, username: 'opencode', password: 'pw' }),
    });
    bodies.length = 0;

    await container.resolve(OpencodeSessionPromptCommand)({
        sessionId: 'ses_1',
        text: 'Tak',
        metadata: { kind: 'generativeUiAnswer' },
    });

    expect(bodies).toEqual([{ text: 'Tak', metadata: { kind: 'generativeUiAnswer' } }]);
});
