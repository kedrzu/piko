import { expect, test } from 'bun:test';

import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { Conversation } from '@piko/common/api/ConversationTypes.js';
import type { Schedule, ScheduleRun } from '@piko/common/api/ScheduleTypes.js';

import type { ConversationOrigin } from '@/conversations/ConversationStore.js';
import * as lr from '@/schedules/describeRun.loc.js';
import * as lt from '@/schedules/describeRunTiming.loc.js';

import { buildProjectHistory, HISTORY_MINE } from './buildProjectHistory.js';
import type { BuildProjectHistoryParams } from './buildProjectHistory.js';

// The tests run with TZ=UTC: local times are UTC.
/** Sunday 22 November 2026, 10:00. */
const NOW = new Date(2026, 10, 22, 10, 0).getTime();
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

/** Mail's skipped term, two days ago, and its failed term without a conversation, eight days ago. */
const SKIPPED_AT = NOW - 2 * DAY;
const FAILED_AT = NOW - 8 * DAY;
const SKIPPED_ROW = `s-mail:${SKIPPED_AT}:${SKIPPED_AT}`;
const FAILED_ROW = `s-mail:${FAILED_AT}:${FAILED_AT}`;

const MAIL: Schedule = schedule('s-mail', 'Sort my mail');
const NEWS: Schedule = schedule('s-news', 'Read the news');

test('each filter’s count is the number of rows it shows', () => {
    const params = fixture();
    const all = buildProjectHistory(params);
    const counts = [
        [null, all.all],
        [HISTORY_MINE, all.mine],
        [MAIL.id, all.bySchedule.get(MAIL.id)],
        [NEWS.id, all.bySchedule.get(NEWS.id)],
    ] as const;

    for (const [filter, count] of counts) {
        expect({ filter, count }).toEqual({ filter, count: buildProjectHistory({ ...params, filter }).rows.length });
    }
    expect(counts.map(([, count]) => count)).toEqual([7, 1, 4, 1]);
});

test('a failed run with its conversation is one row, linking it; one without is a row of its own', () => {
    const rows = buildProjectHistory({ ...fixture(), filter: MAIL.id }).rows;

    expect(rows.map(row => [row.id, row.status, row.detail])).toEqual([
        ['c-run', 'running', 'Still running'],
        ['c-failed', 'failed', 'The browser crashed'],
        [SKIPPED_ROW, 'skipped', translateToString(lr.skippedDetail, 'en')],
        [FAILED_ROW, 'failed', 'No sandbox'],
    ]);
    expect(rows.find(row => row.id === 'c-failed')?.to).toEqual({
        name: 'conversation',
        params: { projectId: 'p1', conversationId: 'c-failed' },
    });
    expect(rows.find(row => row.status === 'skipped')?.to).toBeUndefined();
});

test('Started by you keeps only the person’s conversations: no run, and none of unknown origin', () => {
    const rows = buildProjectHistory({ ...fixture(), filter: HISTORY_MINE }).rows;

    expect(rows.map(row => [row.id, row.status, row.scheduleName])).toEqual([['c-mine', 'person', undefined]]);
});

test('a late run says when it was due and when it started, with why', () => {
    const rows = buildProjectHistory({ ...fixture(), filter: NEWS.id }).rows;

    expect(rows.map(row => [row.status, row.time, row.detail, row.scheduleName])).toEqual([
        ['late', '9:13', translateToString(lt.late, 'en', { due: '7:00', time: '9:13' }), 'Read the news'],
    ]);
});

test('the last seven days are This week, the rest Earlier, newest first', () => {
    const rows = buildProjectHistory(fixture()).rows;

    expect(rows.map(row => [row.id, row.section])).toEqual([
        ['c-late', 'thisWeek'],
        ['c-unknown', 'thisWeek'],
        ['c-mine', 'thisWeek'],
        ['c-run', 'thisWeek'],
        ['c-failed', 'thisWeek'],
        [SKIPPED_ROW, 'thisWeek'],
        [FAILED_ROW, 'earlier'],
    ]);
});

/**
 * Mail: a running run, a failed run with its conversation, a skipped term, an old failed term without one. News: a late
 * run. The person's conversation, and one of unknown origin.
 */
function fixture(): BuildProjectHistoryParams {
    const conversations: Conversation[] = [
        { id: 'c-unknown', updatedAt: NOW - HOUR, running: false },
        { id: 'c-mine', title: 'Plan the trip', updatedAt: NOW - 2 * HOUR, running: false },
        { id: 'c-run', title: 'Mail today', updatedAt: NOW - HOUR, running: true, scheduleId: MAIL.id },
        { id: 'c-late', title: 'News', updatedAt: NOW - 30 * 60_000, running: false, scheduleId: NEWS.id },
        { id: 'c-failed', updatedAt: NOW - DAY, running: false, scheduleId: MAIL.id },
    ];
    const origins = new Map<string, ConversationOrigin>([['c-unknown', 'unknown']]);
    const runs = new Map<string, ScheduleRun[]>([
        [
            MAIL.id,
            [
                { term: NOW - 3 * HOUR, at: NOW - 3 * HOUR, outcome: 'started', conversationId: 'c-run' },
                {
                    term: NOW - DAY - HOUR,
                    at: NOW - DAY - HOUR,
                    outcome: 'failed',
                    conversationId: 'c-failed',
                    message: 'The browser crashed',
                },
                { term: SKIPPED_AT, at: SKIPPED_AT, outcome: 'skipped' },
                { term: FAILED_AT, at: FAILED_AT, outcome: 'failed', message: 'No sandbox' },
            ],
        ],
        [NEWS.id, [{ term: NOW - 3 * HOUR, at: NOW - 47 * 60_000, outcome: 'started', conversationId: 'c-late' }]],
    ]);
    return {
        projectId: 'p1',
        conversations,
        originOf: conversation =>
            conversation.scheduleId === undefined ? (origins.get(conversation.id) ?? 'person') : 'run',
        schedules: [MAIL, NEWS],
        runsOf: item => runs.get(item.id) ?? null,
        filter: null,
        now: NOW,
        language: 'en',
    };
}

function schedule(id: string, name: string): Schedule {
    return {
        id,
        projectId: 'p1',
        projectName: 'Home',
        name,
        when: 'Every day at 7:00',
        rrule: 'FREQ=DAILY;BYHOUR=7;BYMINUTE=0',
        start: '2026-11-01T07:00',
        prompt: 'Do it.',
        paused: false,
    };
}
