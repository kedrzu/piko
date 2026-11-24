import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

const DRIVER_SCRIPT = new URL('./penMergeDriver.sh', import.meta.url).pathname;
const PIKO_CLI = new URL('../packages/cli/src/cli.ts', import.meta.url).pathname;

/** What `setup.sh` registers, per worktree. */
const DRIVER = 'sh scripts/penMergeDriver.sh %O %A %B %P';
/** What a checkout on an older branch registers in the config every worktree shares. */
const STALE_DRIVER = 'bun nzyme pen merge %O %A %B %P';

/** Nested, so the report's name shows how a path is flattened. */
const FILE = 'design/app.pen';

const BASE = { version: '2.22', children: [frame('a', 'A'), frame('b', 'B')] };

test('git merges a .pen file node by node in a worktree, past a stale driver in the shared config', async () => {
    // A line-based merge would conflict: the two names sit a few lines apart.
    const worktree = await createWorktree({
        ours: { ...BASE, children: [frame('a', 'A ours'), frame('b', 'B')] },
        theirs: JSON.stringify({ ...BASE, children: [frame('a', 'A'), frame('b', 'B theirs')] }, null, 2),
    });

    const merge = await run(worktree, 'git', 'merge', '--no-edit', 'theirs');

    expect(merge).toMatchObject({ exitCode: 0 });
    const merged: unknown = JSON.parse(await fs.readFile(path.join(worktree, FILE), 'utf8'));
    expect(merged).toEqual({ ...BASE, children: [frame('a', 'A ours'), frame('b', 'B theirs')] });
});

test('a driver failure leaves the file conflicted at ours, says so and writes a report', async () => {
    const ours = { ...BASE, children: [frame('a', 'A ours'), frame('b', 'B')] };
    const worktree = await createWorktree({ ours, theirs: '{ not json' });

    const merge = await run(worktree, 'git', 'merge', '--no-edit', 'theirs');

    expect(merge.exitCode).toBe(1);
    expect(merge.stderr).toContain(`pen merge driver FAILED on ${FILE}`);
    expect((await run(worktree, 'git', 'ls-files', '-u', '--', FILE)).stdout).not.toBe('');
    expect(JSON.parse(await fs.readFile(path.join(worktree, FILE), 'utf8'))).toEqual(ours);

    const conflicts = (await run(worktree, 'git', 'rev-parse', '--path-format=absolute', '--git-path', 'pen-conflicts'))
        .stdout;
    const report = await fs.readFile(path.join(conflicts.trim(), 'design__app.pen.md'), 'utf8');
    expect(report).toContain('`bun pen merge` exited with code 1');
    expect(report).toContain(`pen merge: cannot merge ${FILE}, ours left as it was`);
    expect(report).toContain(`git show :3:${FILE} > .context/merge/theirs.pen`);
});

interface CreateWorktreeOptions {
    ours: object;
    /** Theirs as text, so it can be a file the driver cannot read. */
    theirs: string;
}

/**
 * A repo with the driver set up as in piko, and a linked worktree of it on `main` with `ours`
 * committed and a `theirs` branch to merge, as in a Paseo worktree.
 */
async function createWorktree(options: CreateWorktreeOptions) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pen-merge-driver-'));
    const repo = path.join(root, 'repo');
    const worktree = path.join(root, 'worktree');

    await fs.mkdir(path.join(repo, 'scripts'), { recursive: true });
    await fs.mkdir(path.join(repo, 'design'));
    await fs.copyFile(DRIVER_SCRIPT, path.join(repo, 'scripts', 'penMergeDriver.sh'));
    await fs.writeFile(path.join(repo, '.gitattributes'), '*.pen merge=pen -diff\n');
    await fs.writeFile(
        path.join(repo, 'package.json'),
        JSON.stringify({ scripts: { pen: `${process.execPath} --conditions=source ${PIKO_CLI} pen` } }),
    );
    await fs.writeFile(path.join(repo, FILE), JSON.stringify(BASE, null, 2));

    await git(repo, 'init', '--quiet', '--initial-branch=base');
    await git(repo, 'config', 'user.name', 'Test');
    await git(repo, 'config', 'user.email', 'test@example.com');
    await git(repo, 'config', 'commit.gpgsign', 'false');
    await git(repo, 'config', 'extensions.worktreeConfig', 'true');
    await git(repo, 'config', 'merge.pen.driver', STALE_DRIVER);
    await commit(repo);

    await git(repo, 'checkout', '--quiet', '-b', 'theirs');
    await fs.writeFile(path.join(repo, FILE), options.theirs);
    await commit(repo);

    await git(repo, 'worktree', 'add', '--quiet', '-b', 'main', worktree, 'base');
    await git(worktree, 'config', '--worktree', 'merge.pen.driver', DRIVER);
    await fs.writeFile(path.join(worktree, FILE), JSON.stringify(options.ours, null, 2));
    await commit(worktree);

    return worktree;
}

function frame(id: string, name: string) {
    return { type: 'frame', id, name, x: 0, y: 0, width: 100, height: 100 };
}

async function commit(cwd: string) {
    await git(cwd, 'add', '-A');
    await git(cwd, 'commit', '--quiet', '-m', 'change');
}

async function git(cwd: string, ...args: string[]) {
    const result = await run(cwd, 'git', ...args);
    if (result.exitCode !== 0) {
        throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
    }
}

async function run(cwd: string, ...command: string[]) {
    const proc = Bun.spawn(command, { cwd, stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    return { stdout, stderr, exitCode };
}
