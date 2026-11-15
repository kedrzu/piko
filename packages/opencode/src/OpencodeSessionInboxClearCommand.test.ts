import { afterAll, expect, test } from 'bun:test';

import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

import { OpencodeConnection } from './OpencodeConnection.js';
import { OpencodeSessionInboxClearCommand } from './OpencodeSessionInboxClearCommand.js';
import type { OpencodeInboxPrompt } from './OpencodeSessionInboxClearCommand.js';
import type { components } from './schema.gen.js';

type VendorInboxItem = components['schemas']['Session.Inbox.Info'];
type VendorSyntheticPayload = components['schemas']['Session.Inbox.SyntheticPayload'];

// A stand-in OpenCode server on the loopback: per session, an inbox with two of the person's prompts around synthetic
// input: OpenCode's own, and the caller's, told by its metadata.
const inbox: VendorInboxItem[] = [
    userItem('msg_1', 'Dopisz czwarty punkt'),
    syntheticItem('msg_2', { text: 'Kontynuuj' }),
    syntheticItem('msg_3', { text: 'Not run', metadata: { app: 'note', plugin: 'gmail' } }),
    syntheticItem('msg_4', { text: 'Other note', metadata: { app: 'other' } }),
    userItem('msg_5', 'I piąty'),
];
const cancelled: Record<string, string[]> = { ses_1: [], ses_2: [] };
const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    routes: {
        '/api/session/:sessionID/inbox': () => Response.json({ data: inbox }),
        '/api/session/:sessionID/inbox/:inboxID': {
            DELETE: request => {
                cancelled[request.params.sessionID]?.push(request.params.inboxID);
                return new Response(null, { status: 204 });
            },
        },
    },
});

afterAll(() => server.stop(true));

const PROMPTS: OpencodeInboxPrompt[] = [
    { id: 'msg_1', text: 'Dopisz czwarty punkt' },
    { id: 'msg_5', text: 'I piąty' },
];

test("cancels only the person's waiting prompts and returns them in the order sent", async () => {
    const prompts = await resolveCommand()('ses_1');

    expect(prompts).toEqual(PROMPTS);
    expect(cancelled.ses_1).toEqual(['msg_1', 'msg_5']);
});

test("also cancels the caller's synthetic input, matched by every entry of its metadata, never anyone else's", async () => {
    const prompts = await resolveCommand()('ses_2', { syntheticMetadata: { app: 'note' } });

    expect(prompts).toEqual(PROMPTS);
    expect(cancelled.ses_2).toEqual(['msg_1', 'msg_3', 'msg_5']);
});

function resolveCommand() {
    const { container } = createTestContainer();
    container.set(OpencodeConnection, {
        getEndpoint: () => ({ url: server.url.origin, username: 'opencode', password: 'pw' }),
    });
    return container.resolve(OpencodeSessionInboxClearCommand);
}

function userItem(id: string, text: string): VendorInboxItem {
    return { id, sessionID: 'ses_1', time: { created: 1 }, type: 'user', payload: { text }, delivery: 'steer' };
}

function syntheticItem(id: string, payload: VendorSyntheticPayload): VendorInboxItem {
    return { id, sessionID: 'ses_1', time: { created: 2 }, type: 'synthetic', payload, delivery: 'queue' };
}
