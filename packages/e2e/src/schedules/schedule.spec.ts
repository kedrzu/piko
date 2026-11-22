import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import type { ScheduleUpdateInput } from '@piko/common/api/ScheduleTypes.js';

import { moment, scheduleWorkspace } from './scheduleWorkspace.js';

// The app says times in the computer's zone; the seed's are UTC.
test.use({ timezoneId: 'UTC' });

test('changing when a schedule runs to weekdays at 7:30 saves the rule, its anchor and its words', async ({ page }) => {
    const daemon = await scheduleWorkspace(page);

    await page.goto('/projects/p-health/schedules/s-inbox');
    await settings(page).getByRole('button', { name: 'Edit when it runs' }).click();
    await settings(page).getByRole('combobox', { name: 'Repeat' }).selectOption('weekdays');
    await settings(page).getByRole('textbox', { name: 'Time' }).fill('7:30');
    await settings(page).getByRole('button', { name: 'Save' }).click();

    await expect(settings(page)).toContainText('Weekdays at\u00a07:30');
    const expected: ScheduleUpdateInput[] = [
        {
            projectId: 'p-health',
            scheduleId: 's-inbox',
            rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=7;BYMINUTE=30',
            // The latest weekday at 7:30 before the clock's Friday noon.
            start: '2026-11-20T07:30',
            // The app's words keep the time on the line of "at".
            when: 'Weekdays at\u00a07:30',
        },
    ];
    expect(daemon.scheduleUpdates).toEqual(expected);
});

test("changing only the name keeps the schedule's rule and the agent's words for it", async ({ page }) => {
    const daemon = await scheduleWorkspace(page);

    await page.goto('/projects/p-health/schedules/s-inbox');
    await settings(page).getByRole('button', { name: 'Edit what it does' }).click();
    await settings(page).getByRole('textbox', { name: 'Name' }).fill('Inbox check');
    await settings(page).getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox check');
    const expected: ScheduleUpdateInput[] = [{ projectId: 'p-health', scheduleId: 's-inbox', name: 'Inbox check' }];
    expect(daemon.scheduleUpdates).toEqual(expected);
});

test('a rule the form cannot show is read-only, with a hint to ask the agent', async ({ page }) => {
    await scheduleWorkspace(page);

    await page.goto('/projects/p-work/schedules/s-invoices');
    await settings(page).getByRole('button', { name: 'Edit when it runs' }).click();

    await expect(settings(page).getByRole('textbox', { name: 'Name' })).toBeVisible();
    await expect(settings(page).getByRole('combobox')).toHaveCount(0);
    await expect(settings(page).getByRole('textbox', { name: 'Time' })).toHaveCount(0);
    await expect(settings(page)).toContainText(
        "This schedule repeats in a way you can't set here. Ask the agent in Work to change it.",
    );
});

test("a change the daemon rejects shows its reason and changes nothing; a schedule gone meanwhile shows it's gone", async ({
    page,
}) => {
    const daemon = await scheduleWorkspace(page);
    daemon.failures.set('schedules/update', {
        status: 400,
        error: 'InvalidSchedule',
        message: 'Another schedule in Health is already called Weekly report.',
    });

    await page.goto('/projects/p-health/schedules/s-inbox');
    await settings(page).getByRole('button', { name: 'Edit what it does' }).click();
    await settings(page).getByRole('textbox', { name: 'Name' }).fill('Weekly report');
    await settings(page).getByRole('button', { name: 'Save' }).click();

    await expect(settings(page).getByRole('alert')).toHaveText(
        "Couldn't save. Another schedule in Health is already called Weekly report.",
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Morning inbox');
    await expect(tab(page, 'Morning inbox')).toBeVisible();
    await expect(settings(page).getByRole('textbox', { name: 'Name' })).toHaveValue('Weekly report');

    daemon.failures.set('schedules/update', {
        status: 404,
        error: 'ScheduleNotFound',
        message: 'Schedule s-inbox not found',
    });
    await settings(page).getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This schedule is gone');
    await expect(main(page).getByRole('link', { name: 'Back to Schedules' })).toBeVisible();
});

test('a schedule is deleted only once confirmed; its tab closes and Schedules shows', async ({ page }) => {
    const daemon = await scheduleWorkspace(page);

    await page.goto('/projects/p-health/schedules/s-inbox');
    await main(page).getByRole('button', { name: 'Delete' }).click();
    await deleteDialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(deleteDialog(page)).toBeHidden();
    expect(daemon.countCalls('schedules/delete')).toBe(0);

    await main(page).getByRole('button', { name: 'Delete' }).click();
    await deleteDialog(page).getByRole('button', { name: 'Delete schedule' }).click();

    await expect(page).toHaveURL(/\/schedules$/);
    await expect(tabLinks(page)).toHaveText(['Schedules']);
    expect(daemon.schedules.map(schedule => schedule.id)).toEqual(['s-report', 's-invoices']);
    await expect(page.getByRole('table', { name: 'Schedules' })).not.toContainText('Morning inbox');
});

test('a delete that fails keeps the dialog open and says so', async ({ page }) => {
    const daemon = await scheduleWorkspace(page);
    daemon.failures.set('schedules/delete', { status: 500, error: 'Error', message: 'EACCES: permission denied' });

    await page.goto('/projects/p-health/schedules/s-inbox');
    await main(page).getByRole('button', { name: 'Delete' }).click();
    await deleteDialog(page).getByRole('button', { name: 'Delete schedule' }).click();

    await expect(deleteDialog(page)).toContainText("Couldn't delete the schedule");
    await expect(page).toHaveURL(/\/projects\/p-health\/schedules\/s-inbox$/);
    expect(daemon.countCalls('schedules/delete')).toBe(1);
});

test("an agent's change to the schedule shows on its page without a reload", async ({ page }) => {
    const daemon = await scheduleWorkspace(page);

    await page.goto('/projects/p-health/schedules/s-report');
    await expect(runRows(page)).toHaveText([/Couldn't start/]);

    daemon.schedules = daemon.schedules.map(schedule =>
        schedule.id === 's-report' ? { ...schedule, prompt: 'Sum up my week in three points.' } : schedule,
    );
    daemon.scheduleRuns['s-report'] = [
        { term: moment(20, 9, 0), at: moment(20, 9, 0), outcome: 'skipped' },
        ...(daemon.scheduleRuns['s-report'] ?? []),
    ];
    daemon.emit({ type: 'schedulesChanged', projectId: 'p-health' });

    await expect(runRows(page)).toHaveText([/Skipped/, /Couldn't start/]);
    await expect(settings(page)).toContainText('Sum up my week in three points.');
});

function main(page: Page) {
    return page.getByRole('main');
}

function settings(page: Page) {
    return main(page).getByRole('region', { name: 'How it runs' });
}

/** The schedule's runs, newest first. */
function runRows(page: Page) {
    return main(page).getByRole('region', { name: 'Runs' }).locator(':scope > div > *');
}

function deleteDialog(page: Page) {
    return page.getByRole('dialog', { name: 'Delete Morning inbox?' });
}

function tabLinks(page: Page) {
    return page.getByRole('navigation', { name: 'Open tabs' }).getByRole('link');
}

function tab(page: Page, name: string) {
    return tabLinks(page).filter({ hasText: name });
}
