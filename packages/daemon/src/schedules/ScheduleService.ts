import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { HttpError } from '@nzyme/fetch-utils/HttpError.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { assert } from '@nzyme/utils/assert.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type {
    Schedule,
    ScheduleCreateInput,
    ScheduleRef,
    ScheduleRun,
    ScheduleRunOutcome,
    ScheduleUpdateInput,
} from '@piko/common/api/ScheduleTypes.js';
import { compareProjectsByName } from '@piko/common/utils/compareProjectsByName.js';

import { SCHEDULES_FOLDER } from '../env.js';
import { ProjectService } from '../projects/ProjectService.js';
import type { LocalProject } from '../projects/ProjectService.js';
import { isErrorCode } from '../utils/isErrorCode.js';
import { isRealFolder } from '../utils/isRealFolder.js';
import { isStringArray } from '../utils/isStringArray.js';
import { replaceFile } from '../utils/replaceFile.js';
import { findScheduleTerms } from './utils/findScheduleTerms.js';
import { parseScheduleDefinition } from './utils/parseScheduleDefinition.js';
import type { ParseScheduleDefinitionResult, ScheduleDefinition } from './utils/parseScheduleDefinition.js';

/**
 * What the daemon keeps about a schedule, in `<project>/.schedules/<id>.state.json` beside its definition: written only
 * by the daemon, read by the agent, which tells the person the next terms and fixes the definition on an `error`.
 */
export interface ScheduleState {
    /** Why the definition is not a valid schedule, addressed to the agent; absent while it is one. */
    error?: string;
    /** The next terms, ISO 8601 with the computer's offset: the agent reads them out to the person. */
    nextRuns: string[];
    /** `rrule|start|paused` of the definition the state is for: when it changes, `activeSince` starts over. */
    ruleKey: string;
    /** ISO 8601: since when the rule under `ruleKey` is active; no term before it runs. */
    activeSince: string;
    /** ISO 8601: the latest term handled. */
    lastTermAt?: string;
    /** Newest first; only the last 100 are kept. */
    runs: ScheduleRun[];
}

/**
 * A schedule's definition file as a scan finds it: the definition or why it is not one, when the file was last written
 * (`modifiedAt`, epoch ms), and the daemon's state of it.
 */
export type ScheduleFile = {
    id: string;
    modifiedAt: number;
    state: ScheduleState | null;
} & ParseScheduleDefinitionResult;

/** Params of {@link ScheduleServiceShape.writeState}. */
export interface ScheduleStateWriteParams {
    project: LocalProject;
    scheduleId: string;
    state: ScheduleState;
}

/**
 * A project's schedules: definition files `<id>.json` in its folder's `.schedules`, written by this API and by the
 * agent, each with the daemon's state beside it. The agent can write anything in the data root, links included, and a
 * link resolves on this computer: so the project folder and `.schedules` are used only when they are real folders, a
 * file only when it is a regular file, and every write replaces the file atomically. Ids from input are checked against
 * the id pattern, so they never lead outside `.schedules`. The API methods throw `HttpError` 404 `ProjectNotFound`,
 * 404 `ScheduleNotFound` (an unknown or malformed id: never one of another project) and 400 `InvalidSchedule`.
 */
export interface ScheduleServiceShape {
    /**
     * A project's schedules, or with no `projectId` every project's, by project, then name. A file that is not a valid
     * definition is not listed; the rest are.
     */
    list(projectId?: string): Promise<Schedule[]>;
    /** Creates a schedule with a new random id. */
    create(input: ScheduleCreateInput): Promise<Schedule>;
    /** Writes the given fields over the current definition and validates the whole; an invalid file can be fixed so. */
    update(input: ScheduleUpdateInput): Promise<Schedule>;
    /** Removes the definition and its state: the history goes with it. */
    remove(ref: ScheduleRef): Promise<void>;
    /** The schedule's runs from its state, newest first; none yet → empty. */
    listRuns(ref: ScheduleRef): Promise<ScheduleRun[]>;
    /** The schedule that started each conversation, from the runs of the project's schedules that still exist. */
    scheduleIdsByConversation(project: LocalProject): Promise<Map<string, string>>;
    /**
     * For the runner: every definition file in the project, valid or not, with its state. A state whose definition is
     * gone is removed, so a schedule created later with the same id starts without history. A file named outside the id
     * pattern is ignored.
     */
    scan(project: LocalProject): Promise<ScheduleFile[]>;
    /**
     * For the runner: replaces the schedule's state, keeping the 100 newest runs. Writes nothing and returns `false`
     * when the definition is gone, also when it was removed while the runner worked: a removed schedule's state never
     * comes back.
     */
    writeState(params: ScheduleStateWriteParams): Promise<boolean>;
}

/** A valid definition with its id. */
interface StoredSchedule {
    id: string;
    definition: ScheduleDefinition;
}

/** A project's `.schedules` folder and the ids of the files in it. */
interface ScheduleFolder {
    dir: string;
    definitionIds: string[];
    stateIds: string[];
}

/** A schedule's id, its file's name: never a path, never hidden. */
const SCHEDULE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DEFINITION_SUFFIX = '.json';
const STATE_SUFFIX = '.state.json';
const RUNS_LIMIT = 100;

/** The schedules of the person's projects, kept as files in the projects' folders. */
export const ScheduleService = defineService({
    name: 'ScheduleService',
    deps: { logger: Logger, projects: ProjectService },
    setup({ logger, projects }): ScheduleServiceShape {
        /**
         * Every write runs one at a time: a state written by the runner and the removal of its schedule cannot interleave,
         * so a removed schedule's state is never written back; an update never merges over a definition being replaced.
         */
        let queue: Promise<unknown> = Promise.resolve();

        return { list, create, update, remove, listRuns, scheduleIdsByConversation, scan, writeState };

        async function list(projectId?: string) {
            const listed = projectId === undefined ? await projects.list() : [await requireProject(projectId)];
            const schedules: Schedule[] = [];
            for (const project of listed) {
                const folder = await readFolder(project);
                if (!folder) {
                    continue;
                }
                const own: Schedule[] = [];
                for (const id of folder.definitionIds) {
                    const result = await readDefinition(folder.dir, id);
                    if (result && 'definition' in result) {
                        const state = await readState(folder.dir, id);
                        own.push(toSchedule(project, { id, definition: result.definition }, state));
                    }
                }
                schedules.push(...own.toSorted(compareProjectsByName));
            }
            return schedules;
        }

        function create(input: ScheduleCreateInput) {
            return exclusive(async () => {
                const project = await requireProject(input.projectId);
                const { projectId: _projectId, ...fields } = input;
                const definition = validate(fields);
                const dir = await ensureSchedulesFolder(project);
                const id = randomUUID();
                await replaceFile(definitionFile(dir, id), serialize(definition));
                logger.info('Schedule created', { projectId: project.id, scheduleId: id });
                return toSchedule(project, { id, definition }, null);
            });
        }

        function update(input: ScheduleUpdateInput) {
            return exclusive(async () => {
                const project = await requireProject(input.projectId);
                const { dir, id } = await requireSchedule(project, input.scheduleId);
                const current = await readJsonObject(definitionFile(dir, id));
                const { projectId: _projectId, scheduleId: _scheduleId, ...fields } = input;
                const definition = validate({ ...current, ...fields });
                await replaceFile(definitionFile(dir, id), serialize(definition));
                logger.info('Schedule updated', { projectId: project.id, scheduleId: id });
                return toSchedule(project, { id, definition }, await readState(dir, id));
            });
        }

        function remove(ref: ScheduleRef) {
            return exclusive(async () => {
                const project = await requireProject(ref.projectId);
                const { dir, id } = await requireSchedule(project, ref.scheduleId);
                // The definition first: a state left behind by a failure in between is an orphan the next scan removes.
                await rm(definitionFile(dir, id));
                await rm(stateFile(dir, id), { force: true });
                logger.info('Schedule deleted', { projectId: project.id, scheduleId: id });
            });
        }

        async function listRuns(ref: ScheduleRef) {
            const project = await requireProject(ref.projectId);
            const { dir, id } = await requireSchedule(project, ref.scheduleId);
            const state = await readState(dir, id);
            return state?.runs.slice(0, RUNS_LIMIT) ?? [];
        }

        async function scheduleIdsByConversation(project: LocalProject) {
            const scheduleIds = new Map<string, string>();
            const folder = await readFolder(project);
            if (!folder) {
                return scheduleIds;
            }
            const definitionIds = new Set(folder.definitionIds);
            for (const id of folder.stateIds) {
                if (!definitionIds.has(id)) {
                    continue;
                }
                const state = await readState(folder.dir, id);
                for (const run of state?.runs ?? []) {
                    if (run.conversationId !== undefined) {
                        scheduleIds.set(run.conversationId, id);
                    }
                }
            }
            return scheduleIds;
        }

        function scan(project: LocalProject) {
            return exclusive(async () => {
                const folder = await readFolder(project);
                if (!folder) {
                    return [];
                }
                const definitionIds = new Set(folder.definitionIds);
                for (const id of folder.stateIds) {
                    if (!definitionIds.has(id)) {
                        await rm(stateFile(folder.dir, id), { force: true });
                        logger.info('Schedule state without its schedule removed', {
                            projectId: project.id,
                            scheduleId: id,
                        });
                    }
                }

                const files: ScheduleFile[] = [];
                for (const id of folder.definitionIds) {
                    const modifiedAt = await readModifiedAt(definitionFile(folder.dir, id));
                    const result = modifiedAt === null ? null : await readDefinition(folder.dir, id);
                    if (modifiedAt !== null && result) {
                        files.push({ id, modifiedAt, state: await readState(folder.dir, id), ...result });
                    }
                }
                return files;
            });
        }

        function writeState({ project, scheduleId, state }: ScheduleStateWriteParams) {
            assert(SCHEDULE_ID.test(scheduleId), 'Invalid schedule id');
            return exclusive(async () => {
                const dir = await findSchedulesFolder(project);
                if (!dir || !(await isRegularFile(definitionFile(dir, scheduleId)))) {
                    return false;
                }
                const kept: ScheduleState = { ...state, runs: state.runs.slice(0, RUNS_LIMIT) };
                await replaceFile(stateFile(dir, scheduleId), serialize(kept));
                return true;
            });
        }

        /** Runs `task` after every task queued before it. */
        function exclusive<T>(task: () => Promise<T>) {
            const result = queue.then(task);
            queue = result.catch(() => undefined);
            return result;
        }

        async function requireProject(projectId: string) {
            const project = await projects.get(projectId);
            if (!project) {
                throw new HttpError(404, { error: 'ProjectNotFound', message: 'No project with this id' });
            }
            return project;
        }

        /** The folder and id of an existing definition file of the project; 404 for anything else. */
        async function requireSchedule(project: LocalProject, scheduleId: string) {
            const dir = SCHEDULE_ID.test(scheduleId) ? await findSchedulesFolder(project) : null;
            if (!dir || !(await isRegularFile(definitionFile(dir, scheduleId)))) {
                throw new HttpError(404, {
                    error: 'ScheduleNotFound',
                    message: 'No schedule with this id in the project',
                });
            }
            return { dir, id: scheduleId };
        }

        /** The definition, validated with its terms; 400 with what is wrong. */
        function validate(value: unknown) {
            const parsed = parseScheduleDefinition(value);
            if ('error' in parsed) {
                throw new HttpError(400, { error: 'InvalidSchedule', message: parsed.error });
            }
            const terms = findScheduleTerms(parsed.definition, {
                now: Date.now(),
                timeZone: Temporal.Now.timeZoneId(),
            });
            if ('error' in terms) {
                throw new HttpError(400, { error: 'InvalidSchedule', message: terms.error });
            }
            return parsed.definition;
        }

        /** The project's `.schedules`, when both are real folders; `null` otherwise. */
        async function findSchedulesFolder(project: LocalProject) {
            const dir = path.join(project.dir, SCHEDULES_FOLDER);
            return (await isRealFolder(project.dir)) && (await isRealFolder(dir)) ? dir : null;
        }

        /** Creates `.schedules` when it is missing, never through a link; throws when it is not a real folder. */
        async function ensureSchedulesFolder(project: LocalProject) {
            assert(await isRealFolder(project.dir), 'Project folder is not a folder');
            const dir = path.join(project.dir, SCHEDULES_FOLDER);
            try {
                // Not recursive: it fails on an existing entry instead of entering a link.
                await mkdir(dir);
            } catch (error) {
                if (!isErrorCode(error, 'EEXIST')) {
                    throw error;
                }
            }
            if (!(await isRealFolder(dir))) {
                logger.warn('Schedules folder is not a folder, schedule not created', { projectId: project.id });
                throw new Error('Schedules folder is not a folder');
            }
            return dir;
        }

        /** The ids of the regular files in the project's `.schedules`; `null` when there is no real one. */
        async function readFolder(project: LocalProject): Promise<ScheduleFolder | null> {
            const dir = await findSchedulesFolder(project);
            if (!dir) {
                return null;
            }
            const entries = await readdir(dir, { withFileTypes: true }).catch((error: unknown) => {
                if (isErrorCode(error, 'ENOENT')) {
                    return [];
                }
                throw error;
            });
            const folder: ScheduleFolder = { dir, definitionIds: [], stateIds: [] };
            for (const entry of entries) {
                // A link is not a file here: it is never read.
                if (!entry.isFile()) {
                    continue;
                }
                if (entry.name.endsWith(STATE_SUFFIX)) {
                    const id = entry.name.slice(0, -STATE_SUFFIX.length);
                    if (SCHEDULE_ID.test(id)) {
                        folder.stateIds.push(id);
                    }
                } else if (entry.name.endsWith(DEFINITION_SUFFIX)) {
                    const id = entry.name.slice(0, -DEFINITION_SUFFIX.length);
                    if (SCHEDULE_ID.test(id)) {
                        folder.definitionIds.push(id);
                    }
                }
            }
            folder.definitionIds.sort();
            return folder;
        }

        /** The definition or why the file is not one; `null` when it is gone or not a regular file. */
        async function readDefinition(dir: string, id: string): Promise<ParseScheduleDefinitionResult | null> {
            let content: string | null;
            try {
                content = await readRegularFile(definitionFile(dir, id));
            } catch {
                return { error: 'The file cannot be read.' };
            }
            if (content === null) {
                return null;
            }
            let value: unknown;
            try {
                value = JSON.parse(content);
            } catch (error) {
                return {
                    error: `The file is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`,
                };
            }
            return parseScheduleDefinition(value);
        }

        /** The schedule's state; `null` when there is none, or it is unreadable or malformed. */
        async function readState(dir: string, id: string) {
            try {
                const content = await readRegularFile(stateFile(dir, id));
                return content === null ? null : parseState(JSON.parse(content));
            } catch {
                return null;
            }
        }

        /** The definition file's JSON object, to update over; empty when it is not one. */
        async function readJsonObject(file: string) {
            try {
                const content = await readRegularFile(file);
                const value: unknown = content === null ? null : JSON.parse(content);
                return isPlainObject(value) ? value : {};
            } catch {
                return {};
            }
        }
    },
});

/** A file's content; `null` when it is missing or not a regular file: a link is never followed. */
async function readRegularFile(file: string) {
    if (!(await isRegularFile(file))) {
        return null;
    }
    try {
        return await readFile(file, 'utf8');
    } catch (error) {
        if (isErrorCode(error, 'ENOENT')) {
            return null;
        }
        throw error;
    }
}

/** When `file` was last written (epoch ms); `null` when it is missing or not a regular file. */
async function readModifiedAt(file: string) {
    try {
        const stats = await lstat(file);
        return stats.isFile() ? stats.mtimeMs : null;
    } catch (error) {
        if (isErrorCode(error, 'ENOENT')) {
            return null;
        }
        throw error;
    }
}

/** Whether `file` is a regular file itself, not a link to one; `false` when it does not exist. */
async function isRegularFile(file: string) {
    try {
        return (await lstat(file)).isFile();
    } catch (error) {
        if (isErrorCode(error, 'ENOENT') || isErrorCode(error, 'ENOTDIR')) {
            return false;
        }
        throw error;
    }
}

/** @__NO_SIDE_EFFECTS__ */
function definitionFile(dir: string, id: string) {
    return path.join(dir, `${id}${DEFINITION_SUFFIX}`);
}

/** @__NO_SIDE_EFFECTS__ */
function stateFile(dir: string, id: string) {
    return path.join(dir, `${id}${STATE_SUFFIX}`);
}

/** @__NO_SIDE_EFFECTS__ */
function serialize(value: ScheduleDefinition | ScheduleState) {
    return `${JSON.stringify(value, null, 4)}\n`;
}

/**
 * The schedule as the API gives it, with its next term now, unless paused or the rule has run out, and its newest run
 * from `state`.
 */
function toSchedule(project: LocalProject, { id, definition }: StoredSchedule, state: ScheduleState | null): Schedule {
    const paused = definition.paused ?? false;
    const schedule: Schedule = {
        id,
        projectId: project.id,
        projectName: project.name,
        name: definition.name,
        when: definition.when,
        rrule: definition.rrule,
        start: definition.start,
        prompt: definition.prompt,
        paused,
    };
    if (!paused) {
        const terms = findScheduleTerms(definition, { now: Date.now(), timeZone: Temporal.Now.timeZoneId() });
        const next = 'error' in terms ? undefined : terms.next[0];
        if (next != null) {
            schedule.nextRunAt = next;
        }
    }
    const lastRun = state?.runs[0];
    if (lastRun) {
        schedule.lastRun = lastRun;
    }
    return schedule;
}

/**
 * A state read back; the agent can write the file too, so anything off makes it `null`, as if there were none.
 * @__NO_SIDE_EFFECTS__
 */
function parseState(value: unknown): ScheduleState | null {
    if (!isPlainObject(value)) {
        return null;
    }
    const { error, nextRuns, ruleKey, activeSince, lastTermAt, runs } = value;
    if (
        !isOptionalString(error) ||
        !isStringArray(nextRuns) ||
        typeof ruleKey !== 'string' ||
        typeof activeSince !== 'string' ||
        !isOptionalString(lastTermAt) ||
        !Array.isArray(runs)
    ) {
        return null;
    }
    const parsedRuns: ScheduleRun[] = [];
    const items: unknown[] = runs;
    for (const run of items) {
        const parsed = parseRun(run);
        if (!parsed) {
            return null;
        }
        parsedRuns.push(parsed);
    }
    return {
        ...(error !== undefined && { error }),
        nextRuns,
        ruleKey,
        activeSince,
        ...(lastTermAt !== undefined && { lastTermAt }),
        runs: parsedRuns,
    };
}

/** @__NO_SIDE_EFFECTS__ */
function parseRun(value: unknown): ScheduleRun | null {
    if (!isPlainObject(value)) {
        return null;
    }
    const { term, at, conversationId, message } = value;
    const outcome = parseOutcome(value.outcome);
    if (
        typeof term !== 'number' ||
        typeof at !== 'number' ||
        !outcome ||
        !isOptionalString(conversationId) ||
        !isOptionalString(message)
    ) {
        return null;
    }
    return {
        term,
        at,
        outcome,
        ...(conversationId !== undefined && { conversationId }),
        ...(message !== undefined && { message }),
    };
}

/** @__NO_SIDE_EFFECTS__ */
function parseOutcome(value: unknown): ScheduleRunOutcome | undefined {
    switch (value) {
        case 'started':
        case 'skipped':
        case 'failed':
            return value;
        default:
            return undefined;
    }
}

/** @__NO_SIDE_EFFECTS__ */
function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string';
}
