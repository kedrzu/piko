import path from 'node:path';

import { expect, test } from 'bun:test';

import { toHostUploadPath } from './toHostUploadPath.js';

const DATA_ROOT = '/Users/someone/Piko';

test.each([
    ['/Piko/report.pdf', 'report.pdf'],
    ['/Piko/projects/a/notes/plan.md', 'projects/a/notes/plan.md'],
    ['/Piko//projects/./a.txt', 'projects/a.txt'],
    ['/Piko/..hidden/a..b.txt', '..hidden/a..b.txt'],
])('maps %p into the data root', (agentPath, relative) => {
    expect(toHostUploadPath(agentPath, DATA_ROOT)).toBe(path.join(DATA_ROOT, relative));
});

test.each([
    '/Piko/../.ssh/id_rsa',
    '/Piko/projects/../../etc/passwd',
    '/Piko/projects/..',
    '/Piko/a/../b.txt',
    '/Piko',
    '/Piko/',
    '/Piko/.',
    '/PikoX/a.txt',
    '/piko/a.txt',
    '/etc/passwd',
    'Piko/a.txt',
    'report.pdf',
    '~/.ssh/id_rsa',
    '/Piko/a\\..\\..\\b.txt',
    '/Piko/a.txt\0.png',
    '',
    undefined,
    42,
    [['/Piko/a.txt']],
])('refuses %p', agentPath => {
    expect(toHostUploadPath(agentPath, DATA_ROOT)).toBeNull();
});
