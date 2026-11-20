import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rename, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

import type { ProjectCreateResult } from '@piko/common/api/ProjectTypes.js';
import type { Schedule, ScheduleCreateInput, ScheduleRun } from '@piko/common/api/ScheduleTypes.js';

import { ProjectService } from '../projects/ProjectService.js';
import type { ScheduleDefinition } from './utils/parseScheduleDefinition.js';
import { ScheduleService } from './ScheduleService.js';
import type { ScheduleFile, ScheduleState } from './ScheduleService.js';

// The filesystem is the boundary: each test gets its own data root in a fresh temporary folder (`<tmp>/root`), with two
// real projects, Alfa and Beta. `<tmp>/outside` stands for the person's files a link could point at.

/** Once, on 1 January 2099 at 7:00: a term that is always ahead. */
const FUTURE: Omit<ScheduleCreateInput, 'projectId'> = {
    name: 'Raport',
    when: '1 stycznia 2099 rano',
    rrule: 'FREQ=YEARLY;COUNT=1',
    start: '2099-01-01T07:00',
    prompt: 'Przygotuj raport',
};

test('creates a schedule as a file and lists it with its next term, by project, then name', async () => {
    const { schedules, alfa, beta } = await setup();

    const created = await schedules.create({ ...FUTURE, projectId: alfa.id, name: 'Zeta' });
    await schedules.create({ ...FUTURE, projectId: beta.id, name: 'Beta raport' });
    await schedules.create({ ...FUTURE, projectId: alfa.id, name: 'alfa' });

    const expected: Schedule = {
        ...FUTURE,
        id: created.id,
        projectId: alfa.id,
        projectName: 'Alfa',
        name: 'Zeta',
        paused: false,
        nextRunAt: Temporal.PlainDateTime.from('2099-01-01T07:00').toZonedDateTime(Temporal.Now.timeZoneId())
            .epochMilliseconds,
    };
    expect(created).toEqual(expected);
    const file: unknown = JSON.parse(await readFile(path.join(alfa.dir, '.schedules', `${created.id}.json`), 'utf8'));
    const definition: ScheduleDefinition = { ...FUTURE, name: 'Zeta' };
    expect(file).toEqual(definition);

    const all = await schedules.list();
    expect(all.map(schedule => [schedule.projectName, schedule.name])).toEqual([
        ['Alfa', 'alfa'],
        ['Alfa', 'Zeta'],
        ['Beta', 'Beta raport'],
    ]);
    expect((await schedules.list(alfa.id)).map(schedule => schedule.name)).toEqual(['alfa', 'Zeta']);
});

test('updates the given fields over the definition; no next term while paused or once the rule ran out', async () => {
    const { schedules, alfa } = await setup();
    const created = await schedules.create({ ...FUTURE, projectId: alfa.id });

    const paused = await schedules.update({ projectId: alfa.id, scheduleId: created.id, paused: true, name: 'Nowy' });
    const ranOut = await schedules.create({ ...FUTURE, projectId: alfa.id, start: '2020-01-01T07:00' });

    const expected: Schedule = { ...created, name: 'Nowy', paused: true };
    delete expected.nextRunAt;
    expect(paused).toEqual(expected);
    expect(ranOut.nextRunAt).toBeUndefined();
    const resumed = await schedules.update({ projectId: alfa.id, scheduleId: created.id, paused: false });
    expect(resumed.nextRunAt).toBe(created.nextRunAt);
});

test('refuses an invalid schedule with what is wrong, writing nothing', async () => {
    const { schedules, alfa } = await setup();
    const created = await schedules.create({ ...FUTURE, projectId: alfa.id });

    await expect(schedules.create({ ...FUTURE, projectId: alfa.id, rrule: 'FREQ=MINUTELY' })).rejects.toMatchObject({
        status: 400,
        payload: { error: 'InvalidSchedule' },
    });
    // Parses, but never occurs: its terms cannot be computed.
    await expect(
        schedules.update({ projectId: alfa.id, scheduleId: created.id, rrule: 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=31' }),
    ).rejects.toMatchObject({ status: 400, payload: { error: 'InvalidSchedule' } });

    expect(await readdir(path.join(alfa.dir, '.schedules'))).toEqual([`${created.id}.json`]);
    expect(await schedules.list(alfa.id)).toEqual([created]);
});

test('skips an invalid file and one named outside the id pattern, lists the rest; a scan reports why', async () => {
    const { schedules, alfa } = await setup();
    const dir = path.join(alfa.dir, '.schedules');
    await mkdir(dir);
    await writeFile(path.join(dir, 'ok.json'), JSON.stringify(FUTURE));
    await writeFile(path.join(dir, 'broken.json'), '{ "name": ');
    await writeFile(path.join(dir, 'minutely.json'), JSON.stringify({ ...FUTURE, rrule: 'FREQ=MINUTELY' }));
    await writeFile(path.join(dir, 'Upper.json'), JSON.stringify(FUTURE));

    expect((await schedules.list(alfa.id)).map(schedule => schedule.id)).toEqual(['ok']);
    const scanned = await schedules.scan(alfa);
    expect(scanned.map(file => [file.id, 'error' in file])).toEqual([
        ['broken', true],
        ['minutely', true],
        ['ok', false],
    ]);
});

test('reads nothing through a link: .schedules, a definition or a state pointing elsewhere', async () => {
    const { schedules, alfa, beta, outside } = await setup();
    await writeFile(path.join(outside, 'secret.json'), JSON.stringify(FUTURE));
    await writeFile(path.join(outside, 'secret.state.json'), JSON.stringify(state([run('ses_secret')])));
    // Alfa's `.schedules` is a link to the outside folder.
    await symlink(outside, path.join(alfa.dir, '.schedules'));
    // Beta's has a real file and links to the outside files beside it.
    const created = await schedules.create({ ...FUTURE, projectId: beta.id });
    const betaDir = path.join(beta.dir, '.schedules');
    await symlink(path.join(outside, 'secret.json'), path.join(betaDir, 'linked.json'));
    await symlink(path.join(outside, 'secret.state.json'), path.join(betaDir, `${created.id}.state.json`));

    expect(await schedules.list(alfa.id)).toEqual([]);
    expect(await schedules.scan(alfa)).toEqual([]);
    expect(await schedules.scheduleIdsByConversation(alfa)).toEqual(new Map());
    await expect(schedules.listRuns({ projectId: alfa.id, scheduleId: 'secret' })).rejects.toMatchObject({
        status: 404,
    });
    await expect(schedules.create({ ...FUTURE, projectId: alfa.id })).rejects.toThrow(
        'Schedules folder is not a folder',
    );

    expect((await schedules.list(beta.id)).map(schedule => schedule.id)).toEqual([created.id]);
    expect((await schedules.scan(beta)).map(file => [file.id, file.state])).toEqual([[created.id, null]]);
    expect(await schedules.listRuns({ projectId: beta.id, scheduleId: created.id })).toEqual([]);
    expect(await schedules.scheduleIdsByConversation(beta)).toEqual(new Map());
    for (const call of [
        () => schedules.update({ projectId: beta.id, scheduleId: 'linked', name: 'Przejęty' }),
        () => schedules.remove({ projectId: beta.id, scheduleId: 'linked' }),
    ]) {
        await expect(call()).rejects.toMatchObject({ status: 404 });
    }

    // A state swapped for a link is replaced, not written through.
    expect(await schedules.writeState({ project: beta, scheduleId: created.id, state: state([]) })).toBe(true);
    expect(JSON.parse(await readFile(path.join(outside, 'secret.state.json'), 'utf8'))).toEqual(
        state([run('ses_secret')]),
    );
    expect((await readdir(outside)).toSorted()).toEqual(['secret.json', 'secret.state.json']);
    expect(JSON.parse(await readFile(path.join(outside, 'secret.json'), 'utf8'))).toEqual(FUTURE);
});

test('uses no project folder swapped for a link since it was listed', async () => {
    const { schedules, alfa, outside } = await setup();
    const created = await schedules.create({ ...FUTURE, projectId: alfa.id });
    await rename(alfa.dir, path.join(outside, 'Alfa'));
    await symlink(path.join(outside, 'Alfa'), alfa.dir);

    expect(await schedules.scan(alfa)).toEqual([]);
    expect(await schedules.writeState({ project: alfa, scheduleId: created.id, state: state([]) })).toBe(false);
    expect(await readdir(path.join(outside, 'Alfa', '.schedules'))).toEqual([`${created.id}.json`]);
});

test("never returns or changes another project's schedule through this project's id", async () => {
    const { schedules, alfa, beta } = await setup();
    const ofBeta = await schedules.create({ ...FUTURE, projectId: beta.id });
    const ref = { projectId: alfa.id, scheduleId: ofBeta.id };

    await expect(schedules.update({ ...ref, name: 'Przejęty' })).rejects.toMatchObject({
        status: 404,
        payload: { error: 'ScheduleNotFound' },
    });
    await expect(schedules.remove(ref)).rejects.toMatchObject({ status: 404 });
    await expect(schedules.listRuns(ref)).rejects.toMatchObject({ status: 404 });
    expect(await schedules.list(alfa.id)).toEqual([]);
    expect(await schedules.list(beta.id)).toEqual([ofBeta]);
});

test('an id that is not a schedule id is not found, whatever it points at', async () => {
    const { schedules, alfa, beta } = await setup();
    const ofBeta = await schedules.create({ ...FUTURE, projectId: beta.id });
    await writeFile(path.join(alfa.dir, 'loose.json'), JSON.stringify(FUTURE));

    for (const scheduleId of [`../../Beta/.schedules/${ofBeta.id}`, '../loose', '..', '', 'A', 'a'.repeat(65)]) {
        const ref = { projectId: alfa.id, scheduleId };
        await expect(schedules.update({ ...ref, name: 'Przejęty' })).rejects.toMatchObject({
            status: 404,
            payload: { error: 'ScheduleNotFound' },
        });
        await expect(schedules.remove(ref)).rejects.toMatchObject({ status: 404 });
        await expect(schedules.listRuns(ref)).rejects.toMatchObject({ status: 404 });
    }
    expect(await schedules.list(beta.id)).toEqual([ofBeta]);
    expect(JSON.parse(await readFile(path.join(alfa.dir, 'loose.json'), 'utf8'))).toEqual(FUTURE);
});

test('an unknown project is not found', async () => {
    const { schedules } = await setup();

    await expect(schedules.list('no-such-project')).rejects.toMatchObject({
        status: 404,
        payload: { error: 'ProjectNotFound' },
    });
    await expect(schedules.create({ ...FUTURE, projectId: 'no-such-project' })).rejects.toMatchObject({ status: 404 });
});

test('keeps the newest 100 runs of a state, and leaves no temporary file behind', async () => {
    const { schedules, alfa } = await setup();
    const created = await schedules.create({ ...FUTURE, projectId: alfa.id });
    const ref = { projectId: alfa.id, scheduleId: created.id };
    expect(await schedules.listRuns(ref)).toEqual([]);

    const runs = Array.from({ length: 101 }, (_, index) => run(`ses_${101 - index}`));
    await schedules.writeState({ project: alfa, scheduleId: created.id, state: state(runs) });
    await schedules.update({ ...ref, name: 'Nowy' });

    expect(await schedules.listRuns(ref)).toEqual(runs.slice(0, 100));
    const scanned = await schedules.scan(alfa);
    const { mtimeMs } = await stat(path.join(alfa.dir, '.schedules', `${created.id}.json`));
    const expected: ScheduleFile[] = [
        {
            id: created.id,
            modifiedAt: mtimeMs,
            definition: { ...FUTURE, name: 'Nowy' },
            state: state(runs.slice(0, 100)),
        },
    ];
    expect(scanned).toEqual(expected);
    expect((await readdir(path.join(alfa.dir, '.schedules'))).toSorted()).toEqual(
        [`${created.id}.json`, `${created.id}.state.json`].toSorted(),
    );
});

test.each(['state first', 'removal first'] as const)(
    'a removed schedule takes its history: no state comes back, a new one with its id starts without (%s)',
    async order => {
        const { schedules, alfa } = await setup();
        const created = await schedules.create({ ...FUTURE, projectId: alfa.id });
        const ref = { projectId: alfa.id, scheduleId: created.id };
        const write = () =>
            schedules.writeState({ project: alfa, scheduleId: created.id, state: state([run('ses_1')]) });

        // Both start at once, as when the runner writes a run while the person deletes the schedule.
        const written =
            order === 'state first'
                ? (await Promise.all([write(), schedules.remove(ref)]))[0]
                : (await Promise.all([schedules.remove(ref), write()]))[1];

        expect(written).toBe(order === 'state first');
        expect(await readdir(path.join(alfa.dir, '.schedules'))).toEqual([]);
        await writeFile(path.join(alfa.dir, '.schedules', `${created.id}.json`), JSON.stringify(FUTURE));
        expect((await schedules.scan(alfa)).map(file => file.state)).toEqual([null]);
        expect(await schedules.scheduleIdsByConversation(alfa)).toEqual(new Map());
    },
);

test('a scan removes a state whose definition the agent deleted, so a schedule with its id starts without history', async () => {
    const { schedules, alfa } = await setup();
    const dir = path.join(alfa.dir, '.schedules');
    await mkdir(dir);
    await writeFile(path.join(dir, 'raport.state.json'), JSON.stringify(state([run('ses_1')])));

    expect(await schedules.scheduleIdsByConversation(alfa)).toEqual(new Map());
    expect(await schedules.scan(alfa)).toEqual([]);
    expect(await readdir(dir)).toEqual([]);

    await writeFile(path.join(dir, 'raport.json'), JSON.stringify(FUTURE));
    expect(await schedules.writeState({ project: alfa, scheduleId: 'raport', state: state([run('ses_2')]) })).toBe(
        true,
    );
    expect(await schedules.scheduleIdsByConversation(alfa)).toEqual(new Map([['ses_2', 'raport']]));
});

async function setup() {
    const { container } = createTestContainer();
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'piko-schedules-'));
    const outside = path.join(tmp, 'outside');
    await mkdir(outside);
    container.set(EnvVariables, { PIKO_DATA_ROOT: path.join(tmp, 'root') });

    const projects = container.resolve(ProjectService);
    const alfaId = assertCreated(await projects.create('Alfa'));
    const betaId = assertCreated(await projects.create('Beta'));
    const alfa = await projects.get(alfaId);
    const beta = await projects.get(betaId);
    return { schedules: container.resolve(ScheduleService), alfa: alfa!, beta: beta!, outside };
}

function state(runs: ScheduleRun[]): ScheduleState {
    return {
        nextRuns: [],
        ruleKey: 'FREQ=YEARLY;COUNT=1|2099-01-01T07:00|false',
        activeSince: '2026-11-14T10:00:00Z',
        runs,
    };
}

function run(conversationId: string): ScheduleRun {
    return { term: 1, at: 2, outcome: 'started', conversationId };
}

function assertCreated(result: ProjectCreateResult): string {
    if (!('created' in result)) {
        throw new Error('Project not created');
    }
    return result.created.id;
}
