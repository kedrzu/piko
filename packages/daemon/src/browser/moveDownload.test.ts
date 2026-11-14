import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { isInsideFolder, moveDownload } from './moveDownload.js';

test.each([
    ['../../.ssh/authorized_keys', '_.._.ssh_authorized_keys'],
    ['..\\evil.txt', '_evil.txt'],
    ['.bashrc', 'bashrc'],
    ['report\u0000\n.pdf', 'report__.pdf'],
    ['...', 'download'],
    ['', 'download'],
    ['   ', 'download'],
    ['..', 'download'],
    ['../../x', '_.._x'],
    ['a/b\\c.txt', 'a_b_c.txt'],
    ['\u0001\u007f.txt', '__.txt'],
])('saves %p as %p inside the folder', async (suggestedName, expected) => {
    const { folder, source } = await prepare();

    const destination = await moveDownload({ source, folder, suggestedName });

    expect(destination).toBe(path.join(folder, expected));
    expect(await readdir(folder)).toEqual([expected]);
    expect(await readdir(path.dirname(folder))).toEqual(['browser', 'downloads']);
});

test('a taken name gets a suffix and neither file is overwritten', async () => {
    const { folder, source, work } = await prepare();
    await writeFile(path.join(folder, 'report.pdf'), 'first');
    await writeFile(path.join(folder, 'report (2).pdf'), 'second');

    const destination = await moveDownload({ source, folder, suggestedName: 'report.pdf' });

    expect(destination).toBe(path.join(folder, 'report (3).pdf'));
    expect(await readFile(path.join(folder, 'report.pdf'), 'utf8')).toBe('first');
    expect(await readFile(path.join(folder, 'report (2).pdf'), 'utf8')).toBe('second');
    expect(await readFile(path.join(folder, 'report (3).pdf'), 'utf8')).toBe('downloaded');
    expect(await readdir(path.join(work, 'browser'))).toEqual([]);
});

test('a link at the destination name is skipped, never written through', async () => {
    const { folder, source, work } = await prepare();
    const outside = path.join(work, 'outside.txt');
    await symlink(outside, path.join(folder, 'report.pdf'));

    const destination = await moveDownload({ source, folder, suggestedName: 'report.pdf' });

    expect(destination).toBe(path.join(folder, 'report (2).pdf'));
    expect(await readdir(work)).not.toContain('outside.txt');
});

test('refuses a Downloads folder that is a link and leaves the download in place', async () => {
    const { source, work } = await prepare();
    const elsewhere = path.join(work, 'elsewhere');
    await mkdir(elsewhere);
    const linked = path.join(work, 'linked-downloads');
    await symlink(elsewhere, linked);

    const destination = await moveDownload({ source, folder: linked, suggestedName: 'report.pdf' });

    expect(destination).toBeNull();
    expect(await readdir(elsewhere)).toEqual([]);
    expect(await readFile(source, 'utf8')).toBe('downloaded');
});

test('a Downloads folder swapped for a link after the check is detected', async () => {
    const { folder, work } = await prepare();
    const elsewhere = path.join(work, 'elsewhere');
    await mkdir(elsewhere);
    const file = path.join(folder, 'report.pdf');
    await writeFile(file, 'x');
    expect(await isInsideFolder(file, folder)).toBe(true);

    await rm(folder, { recursive: true });
    await symlink(elsewhere, folder);
    await writeFile(file, 'x');

    expect(await readdir(elsewhere)).toEqual(['report.pdf']);
    expect(await isInsideFolder(file, folder)).toBe(false);
});

async function prepare() {
    const work = await mkdtemp(path.join(os.tmpdir(), 'poweragents-download-'));
    const folder = path.join(work, 'downloads');
    await mkdir(folder);
    await mkdir(path.join(work, 'browser'));
    const source = path.join(work, 'browser', 'guid-1');
    await writeFile(source, 'downloaded');
    return { work, folder, source };
}
