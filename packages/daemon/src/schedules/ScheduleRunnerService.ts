import { HttpError } from '@nzyme/fetch-utils/HttpError.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';

import type { ScheduleRun } from '@poweragents/common/api/ScheduleTypes.js';
import { OpencodeSessionActiveListCommand } from '@poweragents/opencode/OpencodeSessionActiveListCommand.js';
import { OpencodeSessionFormListCommand } from '@poweragents/opencode/OpencodeSessionFormListCommand.js';
import { OpencodeSessionRenameCommand } from '@poweragents/opencode/OpencodeSessionRenameCommand.js';

import { ConversationService } from '../conversations/ConversationService.js';
import { ProjectService } from '../projects/ProjectService.js';
import type { LocalProject } from '../projects/ProjectService.js';
import { Sandbox } from '../sandbox/Sandbox.js';
import { ScheduleService } from './ScheduleService.js';
import type { ScheduleFile, ScheduleState } from './ScheduleService.js';
import { findScheduleTerms } from './utils/findScheduleTerms.js';
import type { ScheduleTerms } from './utils/findScheduleTerms.js';
import type { ScheduleDefinition } from './utils/parseScheduleDefinition.js';

/**
 * Runs the schedules of every project. A schedule is due when its latest term is later than both the moment its rule
 * became active (written, changed or resumed) and the latest term handled: so after any gap only the latest missed
 * term runs, and never one from before the schedule was seen, changed or paused. A term runs only while the sandbox is
 * ready; until then it waits. Each tick also rewrites a schedule's state file, when it changed, for the agent to read.
 */
export interface ScheduleRunnerServiceShape {
    /** Ticks now and every 5 s after, never two ticks at once; a failing tick is logged and the next one comes. */
    start(): void;
    /** Stops the ticks `start()` began. */
    stop(): void;
    /**
     * Handles every schedule at the moment `now` (epoch ms), with the terms in `timeZone`, the computer's own by
     * default.
     */
    tick(now: number, timeZone?: string): Promise<void>;
}

/** Params of `handleSchedule()` in {@link ScheduleRunnerService}. */
interface HandleScheduleParams {
    project: LocalProject;
    file: ScheduleFile;
    now: number;
    timeZone: string;
}

/** A due term and the schedule it belongs to. */
interface DueTerm {
    project: LocalProject;
    scheduleId: string;
    definition: ScheduleDefinition;
    term: number;
    now: number;
    /** The runs so far, newest first. */
    runs: ScheduleRun[];
}

/** The fields of a state, with the moments as epoch ms. */
interface ScheduleStateFields {
    error?: string;
    nextRuns: string[];
    ruleKey: string;
    activeSince: number;
    lastTermAt: number | undefined;
    runs: ScheduleRun[];
}

/** A valid schedule with its terms, or why it is invalid. */
type EvaluatedSchedule = { definition: ScheduleDefinition; terms: ScheduleTerms } | { error: string };

const TICK_INTERVAL_MS = 5000;
/** The rule key of an invalid definition: one becoming valid has a new key, so it counts from then. */
const INVALID_RULE_KEY = '';

/** The loop that runs the schedules at their terms. */
export const ScheduleRunnerService = defineService({
    name: 'ScheduleRunnerService',
    deps: {
        logger: Logger,
        projects: ProjectService,
        schedules: ScheduleService,
        conversations: ConversationService,
        sandbox: Sandbox,
        rename: OpencodeSessionRenameCommand,
        listActiveSessions: OpencodeSessionActiveListCommand,
        hasPendingForm: OpencodeSessionFormListCommand,
    },
    setup(deps): ScheduleRunnerServiceShape {
        const { logger, projects, schedules, conversations, sandbox } = deps;
        let timer: ReturnType<typeof setInterval> | undefined;
        let ticking = false;

        return { start, stop, tick };

        function start() {
            if (timer !== undefined) {
                return;
            }
            timer = setInterval(() => void runTick(), TICK_INTERVAL_MS);
            void runTick();
        }

        function stop() {
            clearInterval(timer);
            timer = undefined;
        }

        /** A tick, unless the previous one still works: the next interval picks up whatever it skipped. */
        async function runTick() {
            if (ticking) {
                return;
            }
            ticking = true;
            try {
                await tick(Date.now());
            } catch (error) {
                logger.error('Schedule tick failed', { error });
            } finally {
                ticking = false;
            }
        }

        async function tick(now: number, timeZone = Temporal.Now.timeZoneId()) {
            for (const project of await projects.list()) {
                let files: ScheduleFile[];
                try {
                    files = await schedules.scan(project);
                } catch (error) {
                    logger.error('Schedules could not be scanned', { projectId: project.id, error });
                    continue;
                }
                for (const file of files) {
                    try {
                        await handleSchedule({ project, file, now, timeZone });
                    } catch (error) {
                        logger.error('Schedule could not be handled', {
                            projectId: project.id,
                            scheduleId: file.id,
                            error,
                        });
                    }
                }
            }
        }

        /** Recomputes the schedule's state, runs its term when due, and writes the state when it changed. */
        async function handleSchedule({ project, file, now, timeZone }: HandleScheduleParams) {
            const previous = file.state;
            const evaluated = evaluate(file, now, timeZone);
            const ruleKey = 'definition' in evaluated ? toRuleKey(evaluated.definition) : INVALID_RULE_KEY;
            // First seen, the schedule is active since its file was written: a term passed while the daemon was off, or
            // before the first tick, still runs. A changed rule or a resume counts from now.
            let keptSince: number;
            if (previous === null) {
                keptSince = Math.min(file.modifiedAt, now);
            } else if (previous.ruleKey === ruleKey) {
                keptSince = Date.parse(previous.activeSince);
            } else {
                keptSince = Number.NaN;
            }
            const handledTerm = previous?.lastTermAt === undefined ? Number.NaN : Date.parse(previous.lastTermAt);
            const fields: ScheduleStateFields = {
                nextRuns: [],
                ruleKey,
                activeSince: Number.isNaN(keptSince) ? now : keptSince,
                lastTermAt: Number.isNaN(handledTerm) ? undefined : handledTerm,
                runs: previous?.runs ?? [],
            };

            if ('error' in evaluated) {
                fields.error = evaluated.error;
                if (previous?.error !== evaluated.error) {
                    logger.warn('Schedule invalid', {
                        projectId: project.id,
                        scheduleId: file.id,
                        error: evaluated.error,
                    });
                }
            } else {
                const { definition, terms } = evaluated;
                const paused = definition.paused ?? false;
                fields.nextRuns = paused ? [] : terms.next.map(term => toZonedIso(term, timeZone));
                const term = terms.latest;
                const due =
                    !paused && term != null && term > Math.max(fields.activeSince, fields.lastTermAt ?? -Infinity);
                if (due && sandbox.getState().status === 'ready') {
                    const run = await runTerm({
                        project,
                        scheduleId: file.id,
                        definition,
                        term,
                        now,
                        runs: fields.runs,
                    });
                    if (run) {
                        fields.lastTermAt = term;
                        fields.runs = [run, ...fields.runs];
                    }
                }
            }

            const state = toState(fields);
            if (JSON.stringify(state) !== JSON.stringify(previous)) {
                await schedules.writeState({ project, scheduleId: file.id, state });
            }
        }

        /**
         * Starts the term's conversation, or skips it while the previous run still waits for the person; `null` when
         * the sandbox turned out not to be ready, so the term waits for a later tick.
         */
        async function runTerm(due: DueTerm): Promise<ScheduleRun | null> {
            const { project, scheduleId, definition, term, now } = due;
            const fields = { projectId: project.id, scheduleId };

            let blocking: string | null;
            try {
                blocking = await findWaitingRun(due.runs);
            } catch (error) {
                if (isSandboxNotReady(error)) {
                    return null;
                }
                logger.error('Schedule run failed', { ...fields, error });
                return { term, at: now, outcome: 'failed', message: toMessage(error) };
            }
            if (blocking !== null) {
                logger.info('Schedule run skipped', { ...fields, conversationId: blocking });
                return { term, at: now, outcome: 'skipped' };
            }

            let conversationId: string | undefined;
            try {
                conversationId = (await conversations.create(project.id)).id;
                await deps.rename({ sessionId: conversationId, title: definition.name });
                // Sent as the person's message: the conversation shows what the schedule asked.
                await conversations.send({ projectId: project.id, conversationId, text: definition.prompt });
            } catch (error) {
                // Once the conversation exists, the term is handled either way: waiting would start a second one.
                if (conversationId === undefined && isSandboxNotReady(error)) {
                    logger.info('Schedule run postponed, sandbox not ready', fields);
                    return null;
                }
                logger.error('Schedule run failed', { ...fields, conversationId, error });
                return {
                    term,
                    at: now,
                    outcome: 'failed',
                    ...(conversationId !== undefined && { conversationId }),
                    message: toMessage(error),
                };
            }
            logger.info('Schedule run started', { ...fields, conversationId });
            return { term, at: now, outcome: 'started', conversationId };
        }

        /**
         * The conversation of the latest started run while the agent still works in it or waits for the person's
         * answer to its question; `null` otherwise, also when the conversation is gone.
         */
        async function findWaitingRun(runs: ScheduleRun[]) {
            const conversationId = runs.find(run => run.outcome === 'started')?.conversationId;
            if (conversationId === undefined) {
                return null;
            }
            const active = await deps.listActiveSessions();
            if (active.has(conversationId) || (await deps.hasPendingForm(conversationId)) === true) {
                return conversationId;
            }
            return null;
        }
    },
});

/**
 * The state in the key order `ScheduleService` reads it back in, so an unchanged state serialises the same.
 * @__NO_SIDE_EFFECTS__
 */
function toState({ error, nextRuns, ruleKey, activeSince, lastTermAt, runs }: ScheduleStateFields): ScheduleState {
    return {
        ...(error !== undefined && { error }),
        nextRuns,
        ruleKey,
        activeSince: toIso(activeSince),
        ...(lastTermAt !== undefined && { lastTermAt: toIso(lastTermAt) }),
        runs,
    };
}

/**
 * The definition with its terms, or why the schedule is invalid: also a rule whose terms cannot be computed.
 * @__NO_SIDE_EFFECTS__
 */
function evaluate(file: ScheduleFile, now: number, timeZone: string): EvaluatedSchedule {
    if ('error' in file) {
        return { error: file.error };
    }
    const terms = findScheduleTerms(file.definition, { now, timeZone });
    return 'error' in terms ? terms : { definition: file.definition, terms };
}

/** @__NO_SIDE_EFFECTS__ */
function toRuleKey(definition: ScheduleDefinition) {
    return `${definition.rrule}|${definition.start}|${definition.paused ?? false}`;
}

/** @__NO_SIDE_EFFECTS__ */
function toIso(epochMs: number) {
    return new Date(epochMs).toISOString();
}

/**
 * ISO 8601 with the zone's offset, e.g. `2026-11-16T07:00:00+01:00`: the local time the person expects.
 * @__NO_SIDE_EFFECTS__
 */
function toZonedIso(epochMs: number, timeZone: string) {
    return Temporal.Instant.fromEpochMilliseconds(epochMs)
        .toZonedDateTimeISO(timeZone)
        .toString({ timeZoneName: 'never' });
}

/** @__NO_SIDE_EFFECTS__ */
function isSandboxNotReady(error: unknown) {
    return error instanceof HttpError && error.status === 409 && error.payload.error === 'SandboxNotReady';
}

/** @__NO_SIDE_EFFECTS__ */
function toMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
