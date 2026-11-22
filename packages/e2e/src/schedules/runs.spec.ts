import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { moment, scheduleWorkspace } from './scheduleWorkspace.js';

// The app says times in the computer's zone; the seed's are UTC.
test.use({ timezoneId: 'UTC' });

test("a run's conversation says its schedule, when it was due and started, and why it ran late; it leads to the schedule's runs and page", async ({
    page,
}) => {
    await scheduleWorkspace(page);

    await page.goto('/projects/p-health/conversations/c-late');
    await expect(main(page).getByText('Started by Morning inbox')).toBeVisible();
    await expect(main(page)).toContainText('Due today 7:00 · started 9:13, the computer was asleep or piko was closed');

    await page.goto('/projects/p-health/conversations/c-ontime');
    await expect(main(page)).toContainText('Due yesterday 7:00 · started 7:02');
    await expect(main(page)).not.toContainText('asleep');

    await main(page).getByRole('link', { name: 'All runs' }).click();
    await expect(page).toHaveURL(/\/projects\/p-health\/history\?schedule=s-inbox$/);
    await expect(filter(page, 'Morning inbox')).toHaveAttribute('aria-current', 'true');
    await expect(historyRows(page)).toHaveText([/Inbox today/, /Inbox yesterday/, /Skipped/, /Inbox last week/]);

    await page.goto('/projects/p-health/conversations/c-late');
    await main(page).getByRole('link', { name: 'Schedule', exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/p-health\/schedules\/s-inbox$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Morning inbox');
});

test("a run the schedule no longer keeps shows only the schedule's name and the links", async ({ page }) => {
    await scheduleWorkspace(page);

    await page.goto('/projects/p-health/conversations/c-old');
    await expect(main(page).getByText('Started by Morning inbox')).toBeVisible();
    await expect(main(page).getByRole('link', { name: 'All runs' })).toBeVisible();
    await expect(main(page).getByRole('link', { name: 'Schedule', exact: true })).toBeVisible();
    await expect(main(page)).not.toContainText('Due ');
});

test("the project's history lists conversations, runs and terms that started none; each filter shows its rows and counts them", async ({
    page,
}) => {
    await scheduleWorkspace(page);

    await page.goto('/projects/p-health/history');
    await expect(historyRows(page)).toHaveText([
        /Meal plan.*Started\sby\syou/,
        /Inbox today.*asleep.*Morning inbox/,
        /Inbox yesterday/,
        /Skipped.*still\swaiting.*Morning inbox/,
        /Couldn't start.*The sandbox did not start.*Weekly report/,
        /Inbox last week/,
    ]);
    await expect(filters(page)).toHaveText([
        /^All\s*6$/,
        /^Started\sby\syou\s*1$/,
        /^Morning inbox\s*4$/,
        /^Weekly report\s*1$/,
    ]);

    await filter(page, 'Weekly report').click();
    await expect(page).toHaveURL(/\?schedule=s-report$/);
    await expect(historyRows(page)).toHaveText([/Couldn't start/]);

    await filter(page, 'Started by you').click();
    await expect(page).toHaveURL(/\?schedule=mine$/);
    await expect(historyRows(page)).toHaveText([/Meal plan/]);

    await filter(page, 'Morning inbox').click();
    await expect(historyRows(page)).toHaveCount(4);
});

test('the history tab keeps its filter when another tab was shown in between', async ({ page }) => {
    await scheduleWorkspace(page);

    await page.goto('/projects/p-health/history');
    await filter(page, 'Weekly report').click();
    await expect(page).toHaveURL(/\?schedule=s-report$/);
    await sidebarLink(page, 'Meal plan').click();
    await expect(page).toHaveURL(/\/conversations\/c-plan$/);

    await tab(page, 'All conversations').click();
    await expect(page).toHaveURL(/\/projects\/p-health\/history\?schedule=s-report$/);
    await expect(filter(page, 'Weekly report')).toHaveAttribute('aria-current', 'true');
    await expect(historyRows(page)).toHaveText([/Couldn't start/]);
});

test('a run joins the sidebar, marked scheduled, only once opened, and stays there after a restart', async ({
    page,
}) => {
    await scheduleWorkspace(page);

    await page.goto('/projects/p-health/history');
    await expect(sidebarConversations(page)).toHaveText(['New conversation', 'Meal plan', 'All conversations']);

    await historyRows(page).filter({ hasText: 'Inbox today' }).click();
    await expect(page).toHaveURL(/\/conversations\/c-late$/);
    await expect(sidebarLink(page, 'Inbox today scheduled')).toBeVisible();
    await expect(sidebarConversations(page)).toHaveText([
        'New conversation',
        'Meal plan',
        /^Inbox today\s*scheduled$/,
        'All conversations',
    ]);

    await page.reload();
    await expect(sidebarLink(page, 'Inbox today scheduled')).toBeVisible();
    await expect(sidebarConversations(page)).toHaveCount(4);
});

test("an agent's change to the schedules shows in the project's history without a reload", async ({ page }) => {
    const daemon = await scheduleWorkspace(page);

    await page.goto('/projects/p-health/history?schedule=s-report');
    await expect(historyRows(page)).toHaveText([/Couldn't start/]);
    await expect(filter(page, 'Weekly report')).toHaveText(/^Weekly report\s*1$/);

    daemon.scheduleRuns['s-report'] = [
        { term: moment(20, 9, 0), at: moment(20, 9, 0), outcome: 'skipped' },
        ...(daemon.scheduleRuns['s-report'] ?? []),
    ];
    daemon.emit({ type: 'schedulesChanged', projectId: 'p-health' });

    await expect(historyRows(page)).toHaveText([/Skipped/, /Couldn't start/]);
    await expect(filter(page, 'Weekly report')).toHaveText(/^Weekly report\s*2$/);
});

function main(page: Page) {
    return page.getByRole('main');
}

/** The rows of the history, in every section, newest first. */
function historyRows(page: Page) {
    return main(page).getByRole('region').locator(':scope > div > *');
}

function filters(page: Page) {
    return page.getByRole('navigation', { name: 'Show conversations' }).getByRole('link');
}

/** A filter by its label; the app may join the label's words with a non-breaking space. */
function filter(page: Page, name: string) {
    return filters(page).filter({ hasText: new RegExp(`^${name.replaceAll(' ', '\\s')}\\s*\\d+$`) });
}

function sidebarConversations(page: Page) {
    return page.getByRole('list', { name: 'Conversations' }).getByRole('link');
}

function sidebarLink(page: Page, name: string) {
    return page.getByRole('navigation', { name: 'Projects' }).getByRole('link', { name });
}

function tab(page: Page, name: string) {
    return page.getByRole('navigation', { name: 'Open tabs' }).getByRole('link', { name });
}
