import path from 'node:path';

import { expect, test } from 'bun:test';

import { toHostUploadPath } from './toHostUploadPath.js';

const DATA_ROOT = '/Users/someone/Poweragents';

test.each([
    ['/Poweragents/report.pdf', 'report.pdf'],
    ['/Poweragents/projects/a/notes/plan.md', 'projects/a/notes/plan.md'],
    ['/Poweragents//projects/./a.txt', 'projects/a.txt'],
    ['/Poweragents/..hidden/a..b.txt', '..hidden/a..b.txt'],
])('maps %p into the data root', (agentPath, relative) => {
    expect(toHostUploadPath(agentPath, DATA_ROOT)).toBe(path.join(DATA_ROOT, relative));
});

test.each([
    '/Poweragents/../.ssh/id_rsa',
    '/Poweragents/projects/../../etc/passwd',
    '/Poweragents/projects/..',
    '/Poweragents/a/../b.txt',
    '/Poweragents',
    '/Poweragents/',
    '/Poweragents/.',
    '/PoweragentsX/a.txt',
    '/poweragents/a.txt',
    '/etc/passwd',
    'Poweragents/a.txt',
    'report.pdf',
    '~/.ssh/id_rsa',
    '/Poweragents/a\\..\\..\\b.txt',
    '/Poweragents/a.txt\0.png',
    '',
    undefined,
    42,
    [['/Poweragents/a.txt']],
])('refuses %p', agentPath => {
    expect(toHostUploadPath(agentPath, DATA_ROOT)).toBeNull();
});
