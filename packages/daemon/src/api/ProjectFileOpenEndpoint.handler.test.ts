import { expect, mock, test } from 'bun:test';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import type { HttpRequest } from '@nzyme/rpc/types/HttpRequest.js';
import { assert } from '@nzyme/utils/assert.js';

import type { ProjectFileInput, ProjectFileOpenResult } from '@poweragents/common/api/ProjectFileTypes.js';

import { OpenWithDefaultAppCommand } from '../host/OpenWithDefaultAppCommand.js';
import type {
    OpenWithDefaultAppCommandParams,
    OpenWithDefaultAppCommandResult,
} from '../host/OpenWithDefaultAppCommand.js';
import { ProjectService } from '../projects/ProjectService.js';
import { ProjectFileOpenEndpointHandler } from './ProjectFileOpenEndpoint.handler.js';

// The default app is the outside world: it is replaced by a mock, and the test proves which paths ever reach it.

test("opens a project's file by its absolute path", async () => {
    const { open, openPath, projectId, dir } = await setup();
    await mkdir(path.join(dir, 'notatki'));
    await writeFile(path.join(dir, 'notatki', 'plan.pdf'), 'pdf');

    expect(await open({ projectId, path: 'notatki/plan.pdf' })).toEqual({ opened: true });

    const expected: OpenWithDefaultAppCommandParams[] = [{ path: path.join(dir, 'notatki', 'plan.pdf') }];
    expect(openPath.mock.calls.map(([params]) => params)).toEqual(expected);
});

test('never opens a path outside the project, a link, a hidden, missing or non-regular file', async () => {
    const { open, openPath, projectId, dir, root, tmp } = await setup();
    await mkdir(path.join(dir, 'folder.app'));
    await writeFile(path.join(dir, '.ukryty.md'), '# Hidden');
    await writeFile(path.join(root, 'projects', 'outside.md'), '# Outside');
    await symlink('/System/Applications/Calculator.app', path.join(dir, 'calc.app'));
    await symlink(path.join(tmp, 'secret.md'), path.join(dir, 'link.md'));

    const paths = [
        '',
        '-a',
        '../outside.md',
        '..\\outside.md',
        path.join(tmp, 'secret.md'),
        'C:\\secret.md',
        '.ukryty.md',
        'folder.app',
        'calc.app',
        'link.md',
        'brak.md',
    ];
    for (const filePath of paths) {
        const expected: ProjectFileOpenResult = { notFound: true };
        expect({ filePath, result: await open({ projectId, path: filePath }) }).toEqual({ filePath, result: expected });
    }
    expect(await open({ projectId: 'unknown', path: 'plan.md' })).toEqual({ notFound: true });
    expect(openPath).not.toHaveBeenCalled();
});

test('never opens an app, a script or an installer the agent wrote, only documents', async () => {
    const { open, openPath, projectId, dir } = await setup();
    const runnable = ['run.command', 'install.sh', 'setup.pkg', 'tool', 'Script.APPLESCRIPT', 'raport.pdf.command'];
    for (const name of runnable) {
        await writeFile(path.join(dir, name), '#!/bin/sh\n');
    }

    for (const name of runnable) {
        const expected: ProjectFileOpenResult = { notOpenable: true };
        expect({ name, result: await open({ projectId, path: name }) }).toEqual({ name, result: expected });
    }
    expect(openPath).not.toHaveBeenCalled();
});

test('reports a system where it cannot open files', async () => {
    const { open, projectId, dir } = await setup('unsupported');
    await writeFile(path.join(dir, 'plan.md'), '# Plan');

    expect(await open({ projectId, path: 'plan.md' })).toEqual({ unsupported: true });
});

async function setup(outcome: OpenWithDefaultAppCommandResult = 'opened') {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'poweragents-open-'));
    const root = path.join(tmp, 'root');
    await mkdir(root);
    await writeFile(path.join(tmp, 'secret.md'), '# Secret');
    const { container } = createTestContainer();
    container.set(EnvVariables, { POWERAGENTS_DATA_ROOT: root });
    const openPath = mock((_params: OpenWithDefaultAppCommandParams) => Promise.resolve(outcome));
    container.set(OpenWithDefaultAppCommand, openPath);
    const created = await container.resolve(ProjectService).create('Projekt');
    assert('created' in created);
    const handler = container.resolve(ProjectFileOpenEndpointHandler);
    const request: HttpRequest = { method: 'POST', path: '/api/files/open', headers: {}, body: '', ip: '127.0.0.1' };
    const open = (input: ProjectFileInput) => handler(input, { request });
    return {
        open,
        openPath,
        projectId: created.created.id,
        dir: path.join(root, 'projects', 'Projekt'),
        root,
        tmp,
    };
}
