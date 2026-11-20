import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { stageUpload } from './stageUpload.js';

const works: string[] = [];

afterEach(async () => {
    for (const work of works.splice(0)) {
        await rm(work, { recursive: true, force: true });
    }
});

test('copies the file into a fresh folder of its own, keeping its name', async () => {
    const { dataRoot, folder } = await prepare();
    const source = path.join(dataRoot, 'projects', 'report.pdf');
    await mkdir(path.dirname(source));
    await writeFile(source, 'original');

    const first = await stageUpload({ source, dataRoot, folder });
    const second = await stageUpload({ source, dataRoot, folder });

    expect(path.basename(first)).toBe('report.pdf');
    expect(path.dirname(path.dirname(first))).toBe(folder);
    expect(path.dirname(first)).not.toBe(path.dirname(second));
    expect(await readFile(first, 'utf8')).toBe('original');

    // What Chrome reads later is the copy, whatever the agent does to the original.
    await rm(source);
    await symlink(path.join(dataRoot, '..', 'secret.txt'), source);
    expect(await readFile(first, 'utf8')).toBe('original');
});

test('refuses a file that is a link, even to a file inside the data root', async () => {
    const { dataRoot, folder, secret } = await prepare();
    await writeFile(path.join(dataRoot, 'real.txt'), 'inside');
    await symlink(secret, path.join(dataRoot, 'out.txt'));
    await symlink(path.join(dataRoot, 'real.txt'), path.join(dataRoot, 'in.txt'));

    for (const name of ['out.txt', 'in.txt']) {
        await expect(stageUpload({ source: path.join(dataRoot, name), dataRoot, folder })).rejects.toThrow(
            'A file reached through a link cannot be uploaded',
        );
    }
    expect(await readdir(folder).catch(() => [])).toEqual([]);
});

test('refuses a file reached through a linked folder', async () => {
    const { dataRoot, folder, work } = await prepare();
    await mkdir(path.join(work, 'outside'));
    await writeFile(path.join(work, 'outside', 'id_rsa'), 'key');
    await symlink(path.join(work, 'outside'), path.join(dataRoot, 'linked'));

    await expect(stageUpload({ source: path.join(dataRoot, 'linked', 'id_rsa'), dataRoot, folder })).rejects.toThrow(
        'A file reached through a link cannot be uploaded',
    );
});

test('refuses a folder and a FIFO, and a missing file', async () => {
    const { dataRoot, folder } = await prepare();
    await mkdir(path.join(dataRoot, 'folder'));
    execFileSync('mkfifo', [path.join(dataRoot, 'pipe')]);

    await expect(stageUpload({ source: path.join(dataRoot, 'folder'), dataRoot, folder })).rejects.toThrow(
        'Only a regular file can be uploaded',
    );
    await expect(stageUpload({ source: path.join(dataRoot, 'pipe'), dataRoot, folder })).rejects.toThrow(
        'Only a regular file can be uploaded',
    );
    await expect(stageUpload({ source: path.join(dataRoot, 'missing.txt'), dataRoot, folder })).rejects.toThrow(
        'No such file',
    );
});

test('accepts a data root that is itself reached through a link', async () => {
    const { work, folder } = await prepare();
    const realRoot = path.join(work, 'real-root');
    const linkedRoot = path.join(work, 'linked-root');
    await mkdir(realRoot);
    await symlink(realRoot, linkedRoot);
    await writeFile(path.join(realRoot, 'a.txt'), 'a');

    const staged = await stageUpload({ source: path.join(linkedRoot, 'a.txt'), dataRoot: linkedRoot, folder });

    expect(await readFile(staged, 'utf8')).toBe('a');
});

async function prepare() {
    const work = await mkdtemp(path.join(os.tmpdir(), 'stage-upload-'));
    works.push(work);
    const dataRoot = path.join(work, 'Piko');
    const folder = path.join(work, 'state', 'browser-uploads');
    const secret = path.join(work, 'secret.txt');
    await mkdir(dataRoot);
    await writeFile(secret, 'secret');
    return { work, dataRoot, folder, secret };
}
