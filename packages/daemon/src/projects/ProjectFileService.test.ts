import { expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { assert } from '@nzyme/utils/assert.js';

import type {
    ProjectFileEntry,
    ProjectFileListResult,
    ProjectFileReadResult,
    ProjectFileWriteResult,
} from '@poweragents/common/api/ProjectFileTypes.js';

import { ProjectFileService } from './ProjectFileService.js';
import { ProjectService } from './ProjectService.js';

// The filesystem is the boundary: each test gets its own data root in a fresh temporary folder (`<tmp>/root`) with one
// project, `dir`, and a secret file beside the data root (`<tmp>/secret.md`) that no path or link may reach.

test('lists one folder: folders first, then files, by name, without hidden entries, links or pipes', async () => {
    const { files, projectId, dir, tmp } = await setup();
    await mkdir(path.join(dir, 'Zdjęcia'));
    await mkdir(path.join(dir, 'archiwum', 'stare'), { recursive: true });
    await writeFile(path.join(dir, 'b.md'), 'B');
    await writeFile(path.join(dir, 'a.txt'), 'AAA');
    await writeFile(path.join(dir, 'archiwum', 'stare.md'), '# Stare');
    await mkdir(path.join(dir, '.git'));
    await writeFile(path.join(dir, '.ukryty.md'), '# Hidden');
    await symlink(path.join(tmp, 'secret.md'), path.join(dir, 'link.md'));
    await symlink(tmp, path.join(dir, 'linked folder'));
    await mkfifo(path.join(dir, 'pipe.md'));
    await utimes(path.join(dir, 'a.txt'), 1_700_000_000, 1_700_000_000);

    const root = await files.list({ projectId });
    const sub = await files.list({ projectId, path: 'archiwum' });

    assertEntries(root);
    expect(root.entries.map(entry => [entry.kind, entry.path])).toEqual([
        ['folder', 'archiwum'],
        ['folder', 'Zdjęcia'],
        ['file', 'a.txt'],
        ['file', 'b.md'],
    ]);
    const file: ProjectFileEntry = {
        name: 'a.txt',
        path: 'a.txt',
        kind: 'file',
        updatedAt: 1_700_000_000_000,
        size: 3,
    };
    expect(root.entries.find(entry => entry.name === 'a.txt')).toEqual(file);
    assertEntries(sub);
    expect(sub.entries.map(entry => [entry.kind, entry.path])).toEqual([
        ['folder', 'archiwum/stare'],
        ['file', 'archiwum/stare.md'],
    ]);
});

test('lists no folder outside the project, through a link, hidden, missing, or of an unknown project', async () => {
    const { files, projectId, dir, tmp } = await setup();
    await mkdir(path.join(dir, '.git'));
    await mkdir(path.join(tmp, 'elsewhere', 'inner'), { recursive: true });
    await symlink(path.join(tmp, 'elsewhere'), path.join(dir, 'linked'));
    await writeFile(path.join(dir, 'plik.md'), 'not a folder');

    const paths = ['..', '../..', '..\\..', tmp, 'C:\\', '.git', 'linked', 'linked/inner', 'brak', 'plik.md', 'a//b'];
    for (const folder of paths) {
        const expected: ProjectFileListResult = { notFound: true };
        expect({ folder, result: await files.list({ projectId, path: folder }) }).toEqual({ folder, result: expected });
    }
    expect(await files.list({ projectId: 'unknown' })).toEqual({ notFound: true });
});

test('reads a text file with its version, and only the size of any other file', async () => {
    const { files, projectId, dir } = await setup();
    await mkdir(path.join(dir, 'notatki'));
    await writeFile(path.join(dir, 'notatki', 'plan.MD'), '# Plan\n\nZażółć.\n');
    await writeFile(path.join(dir, 'dane.csv'), 'a,b\n1,2\n');
    await writeFile(path.join(dir, 'zdjęcie.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(dir, 'zepsuty.txt'), Buffer.from([0x61, 0xff, 0x62]));
    await writeFile(path.join(dir, 'zero.md'), Buffer.from('a\0b'));
    await utimes(path.join(dir, 'notatki', 'plan.MD'), 1_700_000_000, 1_700_000_000);

    const text: ProjectFileReadResult = {
        text: { content: '# Plan\n\nZażółć.\n', version: sha256('# Plan\n\nZażółć.\n'), updatedAt: 1_700_000_000_000 },
    };
    expect(await files.read({ projectId, path: 'notatki/plan.MD' })).toEqual(text);
    expect(await files.read({ projectId, path: 'dane.csv' })).toMatchObject({ text: { content: 'a,b\n1,2\n' } });
    expect(await files.read({ projectId, path: 'zdjęcie.png' })).toMatchObject({ binary: { size: 4 } });
    expect(await files.read({ projectId, path: 'zepsuty.txt' })).toMatchObject({ binary: { size: 3 } });
    expect(await files.read({ projectId, path: 'zero.md' })).toMatchObject({ binary: { size: 3 } });
});

test('reads a text file up to 1 MiB, and any file as bytes up to 25 MiB', async () => {
    const { files, projectId, dir } = await setup();
    const mib = 1024 * 1024;
    await writeFile(path.join(dir, 'limit.md'), 'x'.repeat(mib));
    await writeFile(path.join(dir, 'duży.md'), 'x'.repeat(mib + 1));
    await writeFile(path.join(dir, 'duży.png'), Buffer.alloc(mib + 1));
    await writeFile(path.join(dir, 'zdjęcie.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(dir, 'film.mov'), Buffer.alloc(25 * mib + 1));

    expect(await files.read({ projectId, path: 'limit.md' })).toMatchObject({
        text: { version: sha256('x'.repeat(mib)) },
    });
    expect(await files.read({ projectId, path: 'duży.md' })).toEqual({ tooLarge: true });
    expect(await files.read({ projectId, path: 'duży.png' })).toMatchObject({ binary: { size: mib + 1 } });
    expect(await files.content({ projectId, path: 'zdjęcie.png' })).toEqual({ base64: 'iVBORw==', size: 4 });
    expect(await files.content({ projectId, path: 'film.mov' })).toEqual({ tooLarge: true });
});

test('locates a file by its absolute path', async () => {
    const { files, projectId, dir } = await setup();
    await mkdir(path.join(dir, 'notatki'));
    await writeFile(path.join(dir, 'notatki', 'plan.md'), '# Plan');

    expect(await files.locate({ projectId, path: 'notatki/plan.md' })).toEqual({
        path: path.join(dir, 'notatki', 'plan.md'),
    });
});

test('never reads, locates or writes outside the project, through a link, a hidden, missing or non-regular file', async () => {
    const { files, projectId, dir, tmp, root } = await setup();
    await mkdir(path.join(dir, 'folder.md'));
    await mkdir(path.join(dir, '.git'));
    await writeFile(path.join(dir, '.git', 'HEAD.md'), '# Hidden');
    await writeFile(path.join(dir, '.ukryty.md'), '# Hidden');
    await writeFile(path.join(root, 'projects', 'outside.md'), '# Outside');
    await symlink(path.join(tmp, 'secret.md'), path.join(dir, 'link.md'));
    await mkdir(path.join(tmp, 'elsewhere'));
    await writeFile(path.join(tmp, 'elsewhere', 'secret.md'), '# Secret');
    await symlink(path.join(tmp, 'elsewhere'), path.join(dir, 'linked'));
    await mkfifo(path.join(dir, 'pipe.md'));
    const secret = sha256('# Secret');

    const paths = [
        '',
        '../outside.md',
        '../../../secret.md',
        'notatki/../../outside.md',
        '..\\outside.md',
        path.join(tmp, 'secret.md'),
        'C:\\secret.md',
        '\\\\server\\share\\secret.md',
        '.ukryty.md',
        '.git/HEAD.md',
        'link.md',
        'linked/secret.md',
        'linked\\secret.md',
        'pipe.md',
        'folder.md',
        'brak.md',
        'plik.md\0.md',
    ];
    for (const filePath of paths) {
        const input = { projectId, path: filePath };
        const results = [
            await files.read(input),
            await files.content(input),
            await files.locate(input),
            await files.write({ ...input, content: 'overwritten', version: secret }),
        ];
        expect({ filePath, results }).toEqual({ filePath, results: results.map(() => ({ notFound: true })) });
    }

    expect(await readFile(path.join(tmp, 'secret.md'), 'utf8')).toBe('# Secret');
    expect(await readFile(path.join(tmp, 'elsewhere', 'secret.md'), 'utf8')).toBe('# Secret');
    expect(await readFile(path.join(root, 'projects', 'outside.md'), 'utf8')).toBe('# Outside');
    expect((await lstat(path.join(dir, 'link.md'))).isSymbolicLink()).toBe(true);
    // A write never creates a file.
    expect(await readdir(dir)).not.toContain('brak.md');
    expect(await files.read({ projectId: 'unknown', path: 'plan.md' })).toEqual({ notFound: true });
});

test('writes a text file whole, keeping its mode, and gives its new version', async () => {
    const { files, projectId, dir } = await setup();
    await writeFile(path.join(dir, 'plan.md'), '# Plan\n');
    await chmod(path.join(dir, 'plan.md'), 0o640);

    const result = await files.write({
        projectId,
        path: 'plan.md',
        content: '# Plan\n\nNowy.\n',
        version: sha256('# Plan\n'),
    });

    expect(result).toMatchObject({ written: { version: sha256('# Plan\n\nNowy.\n') } });
    expect(await files.read({ projectId, path: 'plan.md' })).toMatchObject({
        text: { content: '# Plan\n\nNowy.\n', version: sha256('# Plan\n\nNowy.\n') },
    });
    expect((await stat(path.join(dir, 'plan.md'))).mode & 0o777).toBe(0o640);
    expect((await readdir(dir)).toSorted()).toEqual(['.project.json', 'plan.md']);
});

test('refuses to overwrite a file changed since its version was read, giving its current text', async () => {
    const { files, projectId, dir } = await setup();
    await writeFile(path.join(dir, 'plan.md'), '# Plan agenta\n');
    await utimes(path.join(dir, 'plan.md'), 1_700_000_000, 1_700_000_000);

    const result = await files.write({
        projectId,
        path: 'plan.md',
        content: '# Mój plan\n',
        version: sha256('# Plan\n'),
    });

    const expected: ProjectFileWriteResult = {
        stale: { content: '# Plan agenta\n', version: sha256('# Plan agenta\n'), updatedAt: 1_700_000_000_000 },
    };
    expect(result).toEqual(expected);
    expect(await readFile(path.join(dir, 'plan.md'), 'utf8')).toBe('# Plan agenta\n');
});

test('refuses to write more text than it would read back', async () => {
    const { files, projectId, dir } = await setup();
    const mib = 1024 * 1024;
    await writeFile(path.join(dir, 'plan.md'), '# Plan\n');
    await writeFile(path.join(dir, 'limit.md'), '# Limit\n');

    const over = await files.write({
        projectId,
        path: 'plan.md',
        content: 'ż'.repeat(mib / 2 + 1),
        version: sha256('# Plan\n'),
    });
    const limit = await files.write({
        projectId,
        path: 'limit.md',
        content: 'x'.repeat(mib),
        version: sha256('# Limit\n'),
    });

    expect(over).toEqual({ tooLarge: true });
    expect(await readFile(path.join(dir, 'plan.md'), 'utf8')).toBe('# Plan\n');
    expect(limit).toMatchObject({ written: { version: sha256('x'.repeat(mib)) } });
});

test('writes only a text file', async () => {
    const { files, projectId, dir } = await setup();
    await writeFile(path.join(dir, 'zdjęcie.png'), 'png');
    await writeFile(path.join(dir, 'zepsuty.txt'), Buffer.from([0x61, 0xff]));

    const png = await files.write({ projectId, path: 'zdjęcie.png', content: 'x', version: sha256('png') });
    const broken = await files.write({
        projectId,
        path: 'zepsuty.txt',
        content: 'x',
        version: sha256(Buffer.from([0x61, 0xff])),
    });

    expect([png, broken]).toEqual([{ notFound: true }, { notFound: true }]);
    expect(await readFile(path.join(dir, 'zdjęcie.png'), 'utf8')).toBe('png');
});

test('leaves the file as it was and no temporary file behind when the write fails', async () => {
    const { files, projectId, dir } = await setup();
    await writeFile(path.join(dir, 'plan.md'), '# Plan\n');
    // Windows refuses to replace a file another program holds open: the rename fails.
    const rename = spyOn(fs, 'rename').mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }));

    try {
        const write = files.write({ projectId, path: 'plan.md', content: '# Nowy\n', version: sha256('# Plan\n') });
        await expect(write).rejects.toThrow('busy');
    } finally {
        rename.mockRestore();
    }

    expect((await readdir(dir)).toSorted()).toEqual(['.project.json', 'plan.md']);
    expect(await readFile(path.join(dir, 'plan.md'), 'utf8')).toBe('# Plan\n');
});

async function setup() {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'poweragents-project-files-'));
    const root = path.join(tmp, 'root');
    await mkdir(root);
    await writeFile(path.join(tmp, 'secret.md'), '# Secret');
    const { container } = createTestContainer();
    container.set(EnvVariables, { POWERAGENTS_DATA_ROOT: root });
    const created = await container.resolve(ProjectService).create('Projekt');
    assert('created' in created);
    const dir = path.join(root, 'projects', 'Projekt');
    return { files: container.resolve(ProjectFileService), projectId: created.created.id, dir, root, tmp };
}

function assertEntries(result: ProjectFileListResult): asserts result is { entries: ProjectFileEntry[] } {
    expect(result).toHaveProperty('entries');
}

/** Creates a named pipe: opening it for reading waits for a writer, so the daemon would hang. */
async function mkfifo(file: string) {
    expect(await Bun.spawn(['mkfifo', file]).exited).toBe(0);
}

function sha256(content: string | Buffer) {
    return createHash('sha256').update(content).digest('hex');
}
