import { afterAll, expect, test } from 'bun:test';

import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

import { OpencodeConnection } from './OpencodeConnection.js';
import { OpencodePermissionListCommand } from './OpencodePermissionListCommand.js';
import type { OpencodePermissionRequest } from './OpencodePermissionListCommand.js';

// A stand-in OpenCode server on the loopback, reading the folder the way OpenCode's own client sends it:
// `location[directory]=…` (deepObject), not JSON.
const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    routes: {
        '/api/permission/request': request => {
            const directory = new URL(request.url).searchParams.get('location[directory]');
            if (directory !== '/Poweragents/projects/Próba') {
                return Response.json({ _tag: 'LocationNotFoundError' }, { status: 404 });
            }
            return Response.json({
                location: { directory },
                data: [{ id: 'per_1', sessionID: 'ses_1', action: 'edit', resources: ['hello.md'], save: ['*'] }],
            });
        },
    },
});

afterAll(() => server.stop(true));

test("lists the folder's pending requests, and none for a folder OpenCode does not know", async () => {
    const { container } = createTestContainer();
    container.set(OpencodeConnection, {
        getEndpoint: () => ({ url: server.url.origin, username: 'opencode', password: 'pw' }),
    });
    const list = container.resolve(OpencodePermissionListCommand);

    const expected: OpencodePermissionRequest[] = [
        { sessionId: 'ses_1', permissionId: 'per_1', action: 'edit', resources: ['hello.md'] },
    ];
    expect(await list('/Poweragents/projects/Próba')).toEqual(expected);
    expect(await list('/Poweragents/projects/Inny')).toEqual([]);
});
