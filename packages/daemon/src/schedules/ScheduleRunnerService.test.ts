import { expect, mock, test } from 'bun:test';
import { mkdir, mkdtemp, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { HttpError } from '@nzyme/fetch-utils/HttpError.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';

import type { Conversation } from '@piko/common/api/ConversationTypes.js';
import type { ScheduleCreateInput, ScheduleRun } from '@piko/common/api/ScheduleTypes.js';
import { OpencodeSessionActiveListCommand } from '@piko/opencode/OpencodeSessionActiveListCommand.js';
import { OpencodeSessionCreateCommand } from '@piko/opencode/OpencodeSessionCreateCommand.js';
import type { OpencodeSessionCreateCommandParams } from '@piko/opencode/OpencodeSessionCreateCommand.js';
import { OpencodeSessionFormListCommand } from '@piko/opencode/OpencodeSessionFormListCommand.js';
import { OpencodeSessionGetCommand } from '@piko/opencode/OpencodeSessionGetCommand.js';
import { OpencodeSessionListCommand } from '@piko/opencode/OpencodeSessionListCommand.js';
import { OpencodeSessionPromptCommand } from '@piko/opencode/OpencodeSessionPromptCommand.js';
import type {
    OpencodePromptReceipt,
    OpencodeSessionPromptCommandParams,
} from '@piko/opencode/OpencodeSessionPromptCommand.js';
import { OpencodeSessionRenameCommand } from '@piko/opencode/OpencodeSessionRenameCommand.js';
import type { OpencodeSessionRenameCommandParams } from '@piko/opencode/OpencodeSessionRenameCommand.js';
import { OpencodeSessionSyntheticCommand } from '@piko/opencode/OpencodeSessionSyntheticCommand.js';
import type { OpencodeSessionSyntheticCommandParams } from '@piko/opencode/OpencodeSessionSyntheticCommand.js';
import { OpencodeSessionUpdateCommand } from '@piko/opencode/OpencodeSessionUpdateCommand.js';
import type { OpencodeSession } from '@piko/opencode/OpencodeTypes.js';

import { ConversationService } from '../conversations/ConversationService.js';
import { ChatgptSignInService } from '../chatgpt/ChatgptSignInService.js';
import { ClaudeSignInService } from '../claude/ClaudeSignInService.js';
import { ProjectService } from '../projects/ProjectService.js';
import { Sandbox } from '../sandbox/Sandbox.js';
import type { SandboxEndpoint, SandboxState } from '../sandbox/Sandbox.js';
import { ScheduleRunnerService } from './ScheduleRunnerService.js';
import { ScheduleService } from './ScheduleService.js';
import type { ScheduleState } from './ScheduleService.js';

// OpenCode's commands and the sandbox are the boundary; projects, schedules and conversations are the real services on a
// fresh temporary data root. Every tick gets an explicit moment in Warsaw (CET, +01:00 in November): 13 November 2026 is
// a Friday, 16 November the Monday after.

const ZONE = 'Europe/Warsaw';
/** When a test's schedule files are written, unless it says otherwise: before every tick, after Thursday's 7:00. */
const WRITTEN_AT = '2026-11-13T05:00';

/** Every day at 7:00, since long before the tests' moments. */
const DAILY: Omit<ScheduleCreateInput, 'projectId'> = {
    name: 'Poranny raport',
    when: 'codziennie o 7:00',
    rrule: 'FREQ=DAILY',
    start: '2026-01-01T07:00',
    prompt: 'Przygotuj poranny raport',
};

test('a due term starts a conversation named after the schedule with its prompt, listed with the schedule', async () => {
    const fixture = await setup();
    const schedule = await fixture.createSchedule(DAILY);

    await fixture.tick('2026-11-13T06:00');
    await fixture.tick('2026-11-13T07:00:02');

    const expectedSession: OpencodeSessionCreateCommandParams = {
        directory: '/Piko/projects/Alfa',
        providerId: 'claude-agent',
        modelId: 'sonnet',
        permissions: [],
    };
    expect(fixture.createSession).toHaveBeenCalledTimes(1);
    expect(fixture.createSession).toHaveBeenCalledWith(expectedSession);
    const renamed: OpencodeSessionRenameCommandParams = { sessionId: 'ses_1', title: 'Poranny raport' };
    expect(fixture.rename).toHaveBeenCalledWith(renamed);
    const sent: OpencodeSessionPromptCommandParams = { sessionId: 'ses_1', text: 'Przygotuj poranny raport' };
    expect(fixture.prompt).toHaveBeenCalledWith(sent);

    const state = await fixture.readState(schedule.id);
    const runs: ScheduleRun[] = [
        { term: at('2026-11-13T07:00'), at: at('2026-11-13T07:00:02'), outcome: 'started', conversationId: 'ses_1' },
    ];
    expect(state.runs).toEqual(runs);
    expect(state.lastTermAt).toBe('2026-11-13T06:00:00.000Z');
    const conversations = await fixture.conversations.list(fixture.project.id);
    const expected: Conversation[] = [{ id: 'ses_1', updatedAt: 1, running: false, scheduleId: schedule.id }];
    expect(conversations).toEqual(expected);
});

test('a run’s conversation is listed with its schedule while its prompt is being sent, before the run is recorded', async () => {
    const fixture = await setup();
    const schedule = await fixture.createSchedule(DAILY);
    await fixture.tick('2026-11-13T06:00');
    const sending = Promise.withResolvers<OpencodePromptReceipt>();
    const promptStarted = Promise.withResolvers<void>();
    fixture.prompt.mockImplementationOnce(() => {
        promptStarted.resolve();
        return sending.promise;
    });

    const ticking = fixture.tick('2026-11-13T07:00:02');
    await promptStarted.promise;
    const whileSending = await fixture.conversations.list(fixture.project.id);
    const runsWhileSending = (await fixture.readState(schedule.id)).runs;
    sending.resolve({ messageId: 'msg_1', admittedAt: 1 });
    await ticking;

    const expected: Conversation[] = [{ id: 'ses_1', updatedAt: 1, running: false, scheduleId: schedule.id }];
    expect(runsWhileSending).toEqual([]);
    expect(whileSending).toEqual(expected);
    expect(await fixture.conversations.list(fixture.project.id)).toEqual(expected);
});

test('a weekend without ticks runs once, for the latest missed term only', async () => {
    const fixture = await setup();
    const schedule = await fixture.createSchedule(DAILY);
    await fixture.tick('2026-11-13T06:00');
    await fixture.tick('2026-11-13T07:01');

    await fixture.tick('2026-11-16T09:30');
    await fixture.tick('2026-11-16T09:30:05');

    expect(fixture.createSession).toHaveBeenCalledTimes(2);
    const terms = (await fixture.readState(schedule.id)).runs.map(run => run.term);
    expect(terms).toEqual([at('2026-11-16T07:00'), at('2026-11-13T07:00')]);
});

test('a term passed after the schedule was written and before it was first seen runs once', async () => {
    const fixture = await setup();
    const schedule = await fixture.createSchedule(DAILY, '2026-11-13T06:59:57');

    // The daemon was off, or the first tick came seconds late.
    await fixture.tick('2026-11-13T07:00:02');
    await fixture.tick('2026-11-13T07:00:07');

    const terms = (await fixture.readState(schedule.id)).runs.map(run => run.term);
    expect(terms).toEqual([at('2026-11-13T07:00')]);
    expect(fixture.createSession).toHaveBeenCalledTimes(1);
});

test('runs no term from before the schedule was written', async () => {
    const fixture = await setup();
    // Its start and every term up to today's 7:00 lie before the file was written at 7:30.
    const schedule = await fixture.createSchedule(DAILY, '2026-11-13T07:30');

    await fixture.tick('2026-11-13T09:00');
    expect(fixture.createSession).not.toHaveBeenCalled();
    expect((await fixture.readState(schedule.id)).activeSince).toBe('2026-11-13T06:30:00.000Z');

    await fixture.tick('2026-11-14T07:00:02');
    const terms = (await fixture.readState(schedule.id)).runs.map(run => run.term);
    expect(terms).toEqual([at('2026-11-14T07:00')]);
});

test('a paused schedule never runs, and resumed it counts from the resume', async () => {
    const fixture = await setup();
    const schedule = await fixture.createSchedule(DAILY);
    await fixture.tick('2026-11-13T06:00');
    const ref = { projectId: fixture.project.id, scheduleId: schedule.id };

    await fixture.schedules.update({ ...ref, paused: true });
    await fixture.tick('2026-11-13T07:01');
    await fixture.tick('2026-11-14T07:01');
    expect(fixture.createSession).not.toHaveBeenCalled();
    expect((await fixture.readState(schedule.id)).nextRuns).toEqual([]);

    await fixture.schedules.update({ ...ref, paused: false });
    // Seen resumed at 9:00: Sunday's 7:00, paused over, does not run.
    await fixture.tick('2026-11-15T09:00');
    expect(fixture.createSession).not.toHaveBeenCalled();

    await fixture.tick('2026-11-16T07:01');
    const terms = (await fixture.readState(schedule.id)).runs.map(run => run.term);
    expect(terms).toEqual([at('2026-11-16T07:00')]);
});

test('a changed rule counts from the change', async () => {
    const fixture = await setup();
    const schedule = await fixture.createSchedule({ ...DAILY, start: '2026-01-01T09:00' });
    await fixture.tick('2026-11-13T06:00');

    // Moved to 8:00 at 8:30: today's 8:00 lies after the first sight, yet before the change.
    await fixture.schedules.update({
        projectId: fixture.project.id,
        scheduleId: schedule.id,
        start: '2026-01-01T08:00',
    });
    await fixture.tick('2026-11-13T08:30');
    expect(fixture.createSession).not.toHaveBeenCalled();

    await fixture.tick('2026-11-14T08:01');
    const terms = (await fixture.readState(schedule.id)).runs.map(run => run.term);
    expect(terms).toEqual([at('2026-11-14T08:00')]);
});

test('skips a term while the previous run works or waits for an answer; a gone conversation does not block', async () => {
    const fixture = await setup();
    const schedule = await fixture.createSchedule(DAILY);
    await fixture.tick('2026-11-13T06:00');
    await fixture.tick('2026-11-13T07:01');

    fixture.active.add('ses_1');
    await fixture.tick('2026-11-14T07:01');
    fixture.active.delete('ses_1');
    fixture.forms.set('ses_1', true);
    await fixture.tick('2026-11-15T07:01');
    fixture.forms.set('ses_1', null);
    await fixture.tick('2026-11-16T07:01');

    expect(fixture.createSession).toHaveBeenCalledTimes(2);
    const runs: ScheduleRun[] = [
        { term: at('2026-11-16T07:00'), at: at('2026-11-16T07:01'), outcome: 'started', conversationId: 'ses_2' },
        { term: at('2026-11-15T07:00'), at: at('2026-11-15T07:01'), outcome: 'skipped' },
        { term: at('2026-11-14T07:00'), at: at('2026-11-14T07:01'), outcome: 'skipped' },
        { term: at('2026-11-13T07:00'), at: at('2026-11-13T07:01'), outcome: 'started', conversationId: 'ses_1' },
    ];
    expect((await fixture.readState(schedule.id)).runs).toEqual(runs);
});

test('a run OpenCode fails is recorded as failed with why, and not retried', async () => {
    const fixture = await setup();
    const schedule = await fixture.createSchedule(DAILY);
    await fixture.tick('2026-11-13T06:00');
    fixture.prompt.mockImplementationOnce(() => Promise.reject(new Error('OpenCode answered 500')));

    await fixture.tick('2026-11-13T07:01');
    await fixture.tick('2026-11-13T07:01:05');

    expect(fixture.createSession).toHaveBeenCalledTimes(1);
    const runs: ScheduleRun[] = [
        {
            term: at('2026-11-13T07:00'),
            at: at('2026-11-13T07:01'),
            outcome: 'failed',
            conversationId: 'ses_1',
            message: 'OpenCode answered 500',
        },
    ];
    expect((await fixture.readState(schedule.id)).runs).toEqual(runs);
    expect(fixture.logs.some(log => log.level === 'error' && log.message === 'Schedule run failed')).toBe(true);
});

test('a prompt with the command of a plugin not installed here starts no run: the term fails, and the next one runs', async () => {
    const fixture = await setup();
    const schedule = await fixture.createSchedule({ ...DAILY, prompt: '/email-sorting:sort nowe maile' });
    await fixture.tick('2026-11-13T06:00');

    await fixture.tick('2026-11-13T07:01');
    await fixture.tick('2026-11-14T07:01');

    // The prompt waits in the conversation beside the note for the agent, never starting a run.
    const waiting: OpencodeSessionPromptCommandParams = {
        sessionId: 'ses_1',
        text: '/email-sorting:sort nowe maile',
        resume: false,
    };
    expect(fixture.prompt).toHaveBeenCalledWith(waiting);
    expect(fixture.synthetic).toHaveBeenCalledTimes(2);
    const failed: ScheduleRun = {
        term: at('2026-11-13T07:00'),
        at: at('2026-11-13T07:01'),
        outcome: 'failed',
        conversationId: 'ses_1',
        message:
            'The prompt starts with a command of the plugin email-sorting, which is not installed in this project or the profile: it was not run.',
    };
    const runs = (await fixture.readState(schedule.id)).runs;
    expect(runs.map(run => run.conversationId)).toEqual(['ses_2', 'ses_1']);
    expect(runs[1]).toEqual(failed);
});

test('a term waits while the sandbox is not ready, also when creating its conversation finds it not ready', async () => {
    const fixture = await setup();
    const schedule = await fixture.createSchedule(DAILY);
    await fixture.tick('2026-11-13T06:00');

    fixture.setSandbox({ status: 'startingAgent' });
    await fixture.tick('2026-11-13T07:01');
    fixture.setSandbox(READY);
    fixture.createSession.mockImplementationOnce(() => Promise.reject(sandboxNotReady()));
    await fixture.tick('2026-11-13T07:01:05');

    const waiting = await fixture.readState(schedule.id);
    expect(waiting.runs).toEqual([]);
    expect(waiting.lastTermAt).toBeUndefined();
    expect(waiting.nextRuns[0]).toBe('2026-11-14T07:00:00+01:00');

    await fixture.tick('2026-11-13T07:01:10');
    const runs: ScheduleRun[] = [
        { term: at('2026-11-13T07:00'), at: at('2026-11-13T07:01:10'), outcome: 'started', conversationId: 'ses_1' },
    ];
    expect((await fixture.readState(schedule.id)).runs).toEqual(runs);
});

test('a sandbox found not ready after the conversation was created fails the term, without a second one', async () => {
    const fixture = await setup();
    const schedule = await fixture.createSchedule(DAILY);
    await fixture.tick('2026-11-13T06:00');
    fixture.prompt.mockImplementationOnce(() => Promise.reject(sandboxNotReady()));

    await fixture.tick('2026-11-13T07:01');
    await fixture.tick('2026-11-13T07:01:05');

    expect(fixture.createSession).toHaveBeenCalledTimes(1);
    const runs: ScheduleRun[] = [
        {
            term: at('2026-11-13T07:00'),
            at: at('2026-11-13T07:01'),
            outcome: 'failed',
            conversationId: 'ses_1',
            message: 'The sandbox is not ready',
        },
    ];
    expect((await fixture.readState(schedule.id)).runs).toEqual(runs);
});

test('a definition the agent writes into the folder gets its state and runs', async () => {
    const fixture = await setup();
    await writeSchedulesFile(fixture.project.dir, 'raport-dzienny.json', JSON.stringify(DAILY));

    await fixture.tick('2026-11-13T06:00');

    const expected: ScheduleState = {
        nextRuns: ['2026-11-13T07:00:00+01:00', '2026-11-14T07:00:00+01:00', '2026-11-15T07:00:00+01:00'],
        ruleKey: 'FREQ=DAILY|2026-01-01T07:00|false',
        activeSince: '2026-11-13T04:00:00.000Z',
        runs: [],
    };
    expect(await fixture.readState('raport-dzienny')).toEqual(expected);

    await fixture.tick('2026-11-13T07:01');
    const terms = (await fixture.readState('raport-dzienny')).runs.map(run => run.term);
    expect(terms).toEqual([at('2026-11-13T07:00')]);
});

test('an invalid definition never runs, its state says why, and the other schedules still run', async () => {
    const fixture = await setup();
    const valid = await fixture.createSchedule(DAILY);
    const { prompt: _prompt, ...noPrompt } = DAILY;
    await writeSchedulesFile(fixture.project.dir, 'zepsuty.json', JSON.stringify(noPrompt));

    await fixture.tick('2026-11-13T06:00');
    await fixture.tick('2026-11-13T07:01');

    expect(fixture.createSession).toHaveBeenCalledTimes(1);
    const broken = await fixture.readState('zepsuty');
    expect(broken.error).toContain('"prompt"');
    expect(broken.nextRuns).toEqual([]);
    expect(broken.runs).toEqual([]);
    expect((await fixture.readState(valid.id)).runs.map(run => run.outcome)).toEqual(['started']);
    // Logged when the error appears, not on every tick.
    expect(fixture.logs.filter(log => log.message === 'Schedule invalid')).toHaveLength(1);
});

test('leaves the state file alone while nothing in it changes', async () => {
    const fixture = await setup();
    const schedule = await fixture.createSchedule(DAILY);
    await fixture.tick('2026-11-13T07:30');
    const before = await stat(fixture.stateFile(schedule.id));

    await fixture.tick('2026-11-13T07:30:05');

    // Every write replaces the file with a new one.
    expect((await stat(fixture.stateFile(schedule.id))).ino).toBe(before.ino);
});

const ENDPOINT: SandboxEndpoint = { url: 'http://127.0.0.1:1', username: 'opencode', password: 'pw' };
const READY: SandboxState = { status: 'ready', endpoint: ENDPOINT };

async function setup() {
    const { container, logs } = createTestContainer();
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'piko-schedule-runner-'));
    container.set(EnvVariables, {
        PIKO_DATA_ROOT: path.join(tmp, 'root'),
        PIKO_LIMA_HOME: path.join(tmp, 'home', 'lima'),
        PIKO_PLUGINS_DIR: path.join(import.meta.dirname, '..', 'plugins', 'fixtures', 'bundled'),
    });
    // Conversations start on the connected provider's model: Claude here.
    container.set(ClaudeSignInService, {
        getStatus: () => Promise.resolve({ connected: true, email: 'ola@example.com', plan: 'max', planAllowed: true }),
        startLogin: notUsed,
        completeLogin: notUsed,
        connectAgent: notUsed,
    });
    container.set(ChatgptSignInService, {
        getStatus: () => Promise.resolve({ connected: false }),
        startLogin: notUsed,
        getLoginState: notUsed,
        cancelLogin: notUsed,
    });
    let sandboxState: SandboxState = READY;
    container.set(Sandbox, {
        getState: () => sandboxState,
        getVerifiedState: () => Promise.resolve(sandboxState),
        getStartProgress: () => null,
        stateChanged: createEventEmitter<[state: SandboxState]>().event,
        start: () => Promise.resolve(ENDPOINT),
        stop: () => Promise.resolve(),
        exec: () => {
            throw new Error('not used');
        },
        notifySkillsChanged: () => Promise.resolve(),
    });

    const sessions: OpencodeSession[] = [];
    const active = new Set<string>();
    const forms = new Map<string, boolean | null>();
    const createSession = mock((params: OpencodeSessionCreateCommandParams) => {
        const created: OpencodeSession = {
            id: `ses_${sessions.length + 1}`,
            directory: params.directory,
            createdAt: 1,
            updatedAt: 1,
        };
        sessions.push(created);
        return Promise.resolve(created);
    });
    const prompt = mock((_params: OpencodeSessionPromptCommandParams): Promise<OpencodePromptReceipt> =>
        Promise.resolve({ messageId: 'msg_1', admittedAt: 1 }),
    );
    const rename = mock((_params: OpencodeSessionRenameCommandParams) => Promise.resolve());
    const synthetic = mock((_params: OpencodeSessionSyntheticCommandParams) => Promise.resolve());
    container.set(OpencodeSessionCreateCommand, createSession);
    container.set(OpencodeSessionPromptCommand, prompt);
    container.set(OpencodeSessionRenameCommand, rename);
    container.set(OpencodeSessionSyntheticCommand, synthetic);
    container.set(OpencodeSessionUpdateCommand, () => Promise.resolve());
    container.set(OpencodeSessionListCommand, () => Promise.resolve([...sessions]));
    container.set(OpencodeSessionGetCommand, id => Promise.resolve(sessions.find(item => item.id === id) ?? null));
    container.set(OpencodeSessionActiveListCommand, () => Promise.resolve(new Set(active)));
    container.set(OpencodeSessionFormListCommand, id => Promise.resolve(forms.get(id) ?? false));

    const projects = container.resolve(ProjectService);
    const created = await projects.create('Alfa');
    if (!('created' in created)) {
        throw new Error('Project not created');
    }
    const project = (await projects.get(created.created.id))!;
    const schedules = container.resolve(ScheduleService);
    const runner = container.resolve(ScheduleRunnerService);

    return {
        logs,
        project,
        schedules,
        conversations: container.resolve(ConversationService),
        sessions,
        active,
        forms,
        createSession,
        prompt,
        rename,
        synthetic,
        setSandbox(state: SandboxState) {
            sandboxState = state;
        },
        /** Creates the schedule through the API, its file written at a local date-time in Warsaw. */
        async createSchedule(input: Omit<ScheduleCreateInput, 'projectId'>, writtenAt = WRITTEN_AT) {
            const schedule = await schedules.create({ ...input, projectId: project.id });
            const written = new Date(at(writtenAt));
            await utimes(path.join(project.dir, '.schedules', `${schedule.id}.json`), written, written);
            return schedule;
        },
        /** A tick at a local date-time in Warsaw. */
        tick(local: string) {
            return runner.tick(at(local), ZONE);
        },
        stateFile(scheduleId: string) {
            return path.join(project.dir, '.schedules', `${scheduleId}.state.json`);
        },
        /** The state as `ScheduleService` reads it back. */
        async readState(scheduleId: string): Promise<ScheduleState> {
            const files = await schedules.scan(project);
            return files.find(file => file.id === scheduleId)!.state!;
        },
    };
}

/** Epoch ms of a local date-time in Warsaw. */
function at(local: string) {
    return Temporal.PlainDateTime.from(local).toZonedDateTime(ZONE).epochMilliseconds;
}

/** Writes a file as the agent would, at a local date-time in Warsaw. */
async function writeSchedulesFile(projectDir: string, name: string, content: string) {
    const file = path.join(projectDir, '.schedules', name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
    const written = new Date(at(WRITTEN_AT));
    await utimes(file, written, written);
}

function sandboxNotReady() {
    return new HttpError(409, { error: 'SandboxNotReady', message: 'The sandbox is not ready' });
}

function notUsed(): Promise<never> {
    return Promise.reject(new Error('not used'));
}
