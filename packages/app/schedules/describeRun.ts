import type { Language } from '@nzyme/i18n/Language.js';
import { translateToString } from '@nzyme/i18n/translateToString.js';
import { assertNever } from '@nzyme/utils/assertNever.js';
import type { RouteLocationRaw } from 'vue-router';

import type { Conversation } from '@piko/common/api/ConversationTypes.js';
import type { ScheduleRun } from '@piko/common/api/ScheduleTypes.js';
import type { HistoryRowStatus } from '@piko/ui/HistoryRow.vue';

import * as lc from '@/conversations/Conversations.loc.js';

import * as l from './describeRun.loc.js';
import { describeRunTiming } from './describeRunTiming.js';
import { formatMomentBeside } from './formatMomentBeside.js';
import { formatScheduleMoment } from './formatScheduleMoment.js';
import { isLateRun } from './isLateRun.js';

/** The time of a term that never started. */
const NO_TIME = '—';

/** What `describeRun` needs. */
export interface DescribeRunParams {
    run: ScheduleRun;
    /** The run's conversation, when it is at hand (its project's conversations are listed). */
    conversation: Conversation | undefined;
    /** Titles a started run whose conversation is not at hand. */
    scheduleName: string;
    projectId: string;
    /** Epoch ms of now. */
    now: number;
    language: Language;
}

/** A run as a history row (`HistoryRow`) says it. */
export interface RunDescription {
    day: string;
    time: string;
    status: HistoryRowStatus;
    title: string;
    statusInTitle?: boolean;
    detail: string;
    to?: RouteLocationRaw;
}

/**
 * What became of a schedule's run, as its row in a history says it: a started run by its conversation's title and
 * state ("Still running", "Finished at 8:01", late with why), a skipped or failed term by what became of it.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function describeRun(params: DescribeRunParams): RunDescription {
    const { run, projectId, now, language } = params;
    switch (run.outcome) {
        case 'started':
            return describeStarted(params);
        case 'skipped':
            return {
                day: formatScheduleMoment({ at: run.term, now, language }).day,
                time: NO_TIME,
                status: 'skipped',
                title: translateToString(l.skipped, language),
                statusInTitle: true,
                detail: translateToString(l.skippedDetail, language),
            };
        case 'failed':
            return {
                day: formatScheduleMoment({ at: run.term, now, language }).day,
                time: NO_TIME,
                status: 'failed',
                title: translateToString(l.failed, language),
                statusInTitle: true,
                detail: run.message ?? translateToString(l.failedDetail, language),
                to: conversationRoute(projectId, run.conversationId),
            };
        default:
            return assertNever(run.outcome);
    }
}

/** What `describeRunConversation` needs. */
export interface DescribeRunConversationParams {
    conversation: Conversation;
    projectId: string;
    /** Epoch ms of now. */
    now: number;
    language: Language;
}

/**
 * A run's conversation as a history row says it when the run itself is not known (it fell outside the runs the daemon
 * keeps, or they still load): its state alone, at its last change.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function describeRunConversation({
    conversation,
    projectId,
    now,
    language,
}: DescribeRunConversationParams): RunDescription {
    const at = formatScheduleMoment({ at: conversation.updatedAt, now, language });
    const base = {
        day: at.day,
        time: at.time,
        title: conversation.title ?? translateToString(lc.untitled, language),
        to: conversationRoute(projectId, conversation.id),
    };
    return conversation.running
        ? { ...base, status: 'running', detail: translateToString(l.stillRunning, language) }
        : { ...base, status: 'finished', detail: translateToString(l.finishedAt, language, { time: at.time }) };
}

/** A started run with its conversation's title and state; without its conversation, the schedule's name and only that it started. */
function describeStarted({
    run,
    conversation,
    scheduleName,
    projectId,
    now,
    language,
}: DescribeRunParams): RunDescription {
    const ran = formatScheduleMoment({ at: run.at, now, language });
    const late = isLateRun(run);
    const base = { day: ran.day, time: ran.time, to: conversationRoute(projectId, run.conversationId) };
    if (!conversation) {
        return {
            ...base,
            status: late ? 'late' : 'started',
            title: scheduleName,
            detail: late
                ? describeRunTiming({ run, now, language })
                : translateToString(l.startedAt, language, { time: ran.time }),
        };
    }
    const title = conversation.title ?? translateToString(lc.untitled, language);
    if (conversation.running) {
        return { ...base, status: 'running', title, detail: translateToString(l.stillRunning, language) };
    }
    if (late) {
        return { ...base, status: 'late', title, detail: describeRunTiming({ run, now, language }) };
    }
    const finished = formatMomentBeside({ at: conversation.updatedAt, beside: run.at, now, language });
    return {
        ...base,
        status: 'finished',
        title,
        detail: translateToString(l.finishedAt, language, { time: finished }),
    };
}

function conversationRoute(projectId: string, conversationId: string | undefined): RouteLocationRaw | undefined {
    return conversationId === undefined ? undefined : { name: 'conversation', params: { projectId, conversationId } };
}
