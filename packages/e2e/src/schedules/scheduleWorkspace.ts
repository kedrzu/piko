import type { Page } from '@playwright/test';

import { ACCOUNT_EMAIL, StubDaemon } from '../StubDaemon.js';

/** The page's clock: Friday 20 Nov 2026, 12:00, in the page's time zone (UTC, `test.use({ timezoneId: 'UTC' })`). */
export const NOW = moment(20, 12, 0);

/**
 * Two projects, Claude signed in, the page's clock at `NOW`. Health has two schedules and their runs: Morning inbox ran
 * late today (Inbox today), on time yesterday (Inbox yesterday), skipped on Wednesday and started Inbox last week, a
 * run it no longer keeps; Weekly report could not start on Monday. Health also holds the person's Meal plan. Work has a
 * paused Invoice reminder whose rule the form cannot show.
 */
export async function scheduleWorkspace(page: Page) {
    const daemon = await StubDaemon.install(page);
    await page.clock.setFixedTime(NOW);
    daemon.claude = { connected: true, email: ACCOUNT_EMAIL, plan: 'max', planAllowed: true };
    daemon.projects = [
        { id: 'p-health', name: 'Health' },
        { id: 'p-work', name: 'Work' },
    ];
    daemon.schedules = [
        {
            id: 's-inbox',
            projectId: 'p-health',
            projectName: 'Health',
            name: 'Morning inbox',
            when: 'Every day at 7:00',
            rrule: 'FREQ=DAILY;BYHOUR=7;BYMINUTE=0',
            start: '2026-11-01T07:00',
            prompt: "Check my inbox and tell me what's urgent.",
            paused: false,
            nextRunAt: moment(21, 7, 0),
        },
        {
            id: 's-report',
            projectId: 'p-health',
            projectName: 'Health',
            name: 'Weekly report',
            when: 'Every Monday at 9:00',
            rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0',
            start: '2026-11-02T09:00',
            prompt: 'Sum up my week.',
            paused: false,
            nextRunAt: moment(23, 9, 0),
        },
        {
            id: 's-invoices',
            projectId: 'p-work',
            projectName: 'Work',
            name: 'Invoice reminder',
            when: 'On the last workday of the month',
            rrule: 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;BYHOUR=10;BYMINUTE=0',
            start: '2026-11-01T10:00',
            prompt: 'Remind me to send the invoices.',
            paused: true,
        },
    ];
    daemon.scheduleRuns = {
        's-inbox': [
            { term: moment(20, 7, 0), at: moment(20, 9, 13), outcome: 'started', conversationId: 'c-late' },
            { term: moment(19, 7, 0), at: moment(19, 7, 2), outcome: 'started', conversationId: 'c-ontime' },
            { term: moment(18, 7, 0), at: moment(18, 7, 0), outcome: 'skipped' },
        ],
        's-report': [
            { term: moment(16, 9, 0), at: moment(16, 9, 0), outcome: 'failed', message: 'The sandbox did not start' },
        ],
    };
    daemon.conversations['p-health'] = [
        { id: 'c-plan', title: 'Meal plan', updatedAt: moment(20, 10, 0), running: false, provider: 'claude' },
        {
            id: 'c-late',
            title: 'Inbox today',
            updatedAt: moment(20, 9, 20),
            running: false,
            provider: 'claude',
            scheduleId: 's-inbox',
        },
        {
            id: 'c-ontime',
            title: 'Inbox yesterday',
            updatedAt: moment(19, 7, 10),
            running: false,
            provider: 'claude',
            scheduleId: 's-inbox',
        },
        {
            id: 'c-old',
            title: 'Inbox last week',
            updatedAt: moment(10, 7, 5),
            running: false,
            provider: 'claude',
            scheduleId: 's-inbox',
        },
    ];
    daemon.conversations['p-work'] = [
        { id: 'c-cover', title: 'Cover letter', updatedAt: moment(19, 15, 0), running: false, provider: 'claude' },
    ];
    return daemon;
}

/** A moment of November 2026, in UTC. */
export function moment(day: number, hour: number, minute: number) {
    return Date.UTC(2026, 10, day, hour, minute);
}
