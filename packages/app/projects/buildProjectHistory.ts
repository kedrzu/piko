import type { Language } from '@nzyme/i18n/Language.js';
import { translateToString } from '@nzyme/i18n/translateToString.js';
import { assertNever } from '@nzyme/utils/assertNever.js';

import type { Conversation } from '@piko/common/api/ConversationTypes.js';
import type { Schedule, ScheduleRun } from '@piko/common/api/ScheduleTypes.js';
import type { ProjectHistoryLayoutRow, ProjectHistoryLayoutSection } from '@piko/ui/ProjectHistoryLayout.vue';

import * as lc from '@/conversations/Conversations.loc.js';
import type { ConversationOrigin } from '@/conversations/ConversationStore.js';
import { describeRun, describeRunConversation } from '@/schedules/describeRun.js';
import type { RunDescription } from '@/schedules/describeRun.js';
import { formatScheduleMoment } from '@/schedules/formatScheduleMoment.js';

import * as l from './buildProjectHistory.loc.js';

/** The `?schedule=` of the history that keeps the conversations the person started. */
export const HISTORY_MINE = 'mine';

/** Rows newer than this are "This week": the last seven days, not the calendar week. */
const THIS_WEEK_MS = 7 * 24 * 60 * 60_000;

/** What `buildProjectHistory` needs. */
export interface BuildProjectHistoryParams {
    projectId: string;
    /** The project's conversations. */
    conversations: readonly Conversation[];
    originOf: (conversation: Conversation) => ConversationOrigin;
    /** The project's schedules. */
    schedules: readonly Schedule[];
    /** A schedule's runs, newest first; `null` while they load. */
    runsOf: (schedule: Schedule) => readonly ScheduleRun[] | null;
    /** `null` for all; {@link HISTORY_MINE} for the person's; else a schedule's id. */
    filter: string | null;
    /** Epoch ms of now. */
    now: number;
    language: Language;
}

/** A project's history, the filter applied, and how many rows each filter leaves. */
export interface ProjectHistory {
    /** Newest first. */
    rows: ProjectHistoryLayoutRow[];
    /** How many rows All leaves. */
    all: number;
    /** How many rows Started by you leaves. */
    mine: number;
    /** How many rows each schedule's filter leaves, by the schedule's id. */
    bySchedule: Map<string, number>;
}

/** A row with what the filters ask of it. */
interface HistoryEntry {
    row: ProjectHistoryLayoutRow;
    /** Epoch ms it is sorted by. */
    at: number;
    origin: ConversationOrigin;
    /** The schedule that started it. */
    scheduleId: string | undefined;
}

/**
 * Every conversation of a project and the terms of its schedules that started none, newest first, as its history lists
 * them: a run's conversation is one row (a failed run with a conversation too); a skipped term, or a failed one whose
 * conversation is not listed, is a row of its own. "Started by you" keeps only the conversations known to be the
 * person's, never one of unknown origin.
 * @__NO_SIDE_EFFECTS__
 */
export function buildProjectHistory(params: BuildProjectHistoryParams): ProjectHistory {
    const entries = [...conversationEntries(params), ...termEntries(params)].toSorted((a, b) => b.at - a.at);
    const bySchedule = new Map<string, number>();
    let mine = 0;
    for (const entry of entries) {
        if (matches(entry, HISTORY_MINE)) {
            mine++;
        }
        if (entry.scheduleId !== undefined) {
            bySchedule.set(entry.scheduleId, (bySchedule.get(entry.scheduleId) ?? 0) + 1);
        }
    }
    return {
        rows: entries.filter(entry => matches(entry, params.filter)).map(entry => entry.row),
        all: entries.length,
        mine,
        bySchedule,
    };
}

function matches(entry: HistoryEntry, filter: string | null) {
    if (filter === null) {
        return true;
    }
    return filter === HISTORY_MINE ? entry.origin === 'person' : entry.scheduleId === filter;
}

function conversationEntries(params: BuildProjectHistoryParams): HistoryEntry[] {
    const { projectId, conversations, originOf, schedules, runsOf, now, language } = params;
    const entries: HistoryEntry[] = [];
    for (const conversation of conversations) {
        const origin = originOf(conversation);
        const schedule = schedules.find(candidate => candidate.id === conversation.scheduleId);
        const run =
            schedule === undefined
                ? undefined
                : runsOf(schedule)?.find(candidate => candidate.conversationId === conversation.id);
        let at: number;
        let description: RunDescription;
        if (run !== undefined && schedule !== undefined) {
            at = run.at;
            description = describeRun({
                run,
                conversation,
                scheduleName: schedule.name,
                projectId,
                now,
                language,
            });
        } else {
            at = conversation.updatedAt;
            description = describeConversation(conversation, origin, params);
        }
        entries.push({
            row: { id: conversation.id, section: sectionOf(at, now), scheduleName: schedule?.name, ...description },
            at,
            origin,
            scheduleId: conversation.scheduleId,
        });
    }
    return entries;
}

/** The terms that started no conversation listed: skipped ones, and failed ones without their conversation. */
function termEntries({ projectId, conversations, schedules, runsOf, now, language }: BuildProjectHistoryParams) {
    const listed = new Set(conversations.map(conversation => conversation.id));
    const entries: HistoryEntry[] = [];
    for (const schedule of schedules) {
        for (const run of runsOf(schedule) ?? []) {
            if (!isOwnRow(run, listed)) {
                continue;
            }
            const description = describeRun({
                run,
                conversation: undefined,
                scheduleName: schedule.name,
                projectId,
                now,
                language,
            });
            entries.push({
                row: {
                    id: `${schedule.id}:${run.term}:${run.at}`,
                    section: sectionOf(run.at, now),
                    scheduleName: schedule.name,
                    ...description,
                },
                at: run.at,
                origin: 'run',
                scheduleId: schedule.id,
            });
        }
    }
    return entries;
}

function isOwnRow(run: ScheduleRun, listed: ReadonlySet<string>) {
    switch (run.outcome) {
        case 'started':
            return false;
        case 'skipped':
            return true;
        case 'failed':
            return run.conversationId === undefined || !listed.has(run.conversationId);
        default:
            return assertNever(run.outcome);
    }
}

/**
 * A conversation whose run is not known: the person's, one of unknown origin, or a run that fell outside the runs the
 * daemon keeps (or whose runs still load), said by its state alone.
 */
function describeConversation(
    conversation: Conversation,
    origin: ConversationOrigin,
    { projectId, now, language }: BuildProjectHistoryParams,
): RunDescription {
    if (origin === 'run') {
        return describeRunConversation({ conversation, projectId, now, language });
    }
    const at = formatScheduleMoment({ at: conversation.updatedAt, now, language });
    return {
        day: at.day,
        time: at.time,
        // An unknown one may be a run its schedule has not recorded yet: neither the person's nor a run's mark.
        status: origin === 'person' ? 'person' : 'started',
        title: conversation.title ?? translateToString(lc.untitled, language),
        detail: translateToString(origin === 'person' ? l.byYou : l.justStarted, language),
        to: { name: 'conversation', params: { projectId, conversationId: conversation.id } },
    };
}

function sectionOf(at: number, now: number): ProjectHistoryLayoutSection {
    return now - at < THIS_WEEK_MS ? 'thisWeek' : 'earlier';
}
