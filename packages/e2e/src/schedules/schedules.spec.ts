import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import type { ScheduleUpdateInput } from '@piko/common/api/ScheduleTypes.js';

import { moment, scheduleWorkspace } from './scheduleWorkspace.js';

// The app says times in the computer's zone; the seed's are UTC.
test.use({ timezoneId: 'UTC' });

test("Schedules lists every project's schedules; the switch pauses one and its row says so", async ({ page }) => {
    const daemon = await scheduleWorkspace(page);

    await page.goto('/schedules');
    await expect(scheduleRows(page)).toHaveText([
        /Morning inbox.*Health.*Every day at 7:00/,
        /Weekly report.*Health/,
        /Invoice reminder.*Work.*Paused/,
    ]);
    await expect(scheduleSwitch(page, 'Invoice reminder')).not.toBeChecked();

    await scheduleSwitch(page, 'Morning inbox').click();

    await expect(scheduleSwitch(page, 'Morning inbox')).not.toBeChecked();
    await expect(scheduleRow(page, 'Morning inbox')).toContainText('Paused');
    const expected: ScheduleUpdateInput[] = [{ projectId: 'p-health', scheduleId: 's-inbox', paused: true }];
    expect(daemon.scheduleUpdates).toEqual(expected);
});

test('a pause that fails puts the switch back as the schedule is', async ({ page }) => {
    const daemon = await scheduleWorkspace(page);
    daemon.failures.set('schedules/update', { status: 500, error: 'Error', message: 'EACCES: permission denied' });

    await page.goto('/schedules');
    await expect(scheduleSwitch(page, 'Morning inbox')).toBeChecked();
    await scheduleSwitch(page, 'Morning inbox').click();

    await expect.poll(() => daemon.countCalls('schedules/update')).toBe(1);
    await expect(scheduleSwitch(page, 'Morning inbox')).toBeChecked();
    await expect(scheduleRow(page, 'Morning inbox')).not.toContainText('Paused');
});

test("an agent's change to the schedules shows on Schedules without a reload", async ({ page }) => {
    const daemon = await scheduleWorkspace(page);

    await page.goto('/schedules');
    await expect(scheduleRows(page)).toHaveCount(3);

    daemon.schedules = [
        ...daemon.schedules,
        {
            id: 's-water',
            projectId: 'p-health',
            projectName: 'Health',
            name: 'Drink water',
            when: 'Every day at 11:00',
            rrule: 'FREQ=DAILY;BYHOUR=11;BYMINUTE=0',
            start: '2026-11-20T11:00',
            prompt: 'Remind me to drink water.',
            paused: false,
            nextRunAt: moment(21, 11, 0),
        },
    ];
    await expect.poll(() => daemon.streaming).toBe(true);
    daemon.emit({ type: 'schedulesChanged', projectId: 'p-health' });

    await expect(scheduleRows(page)).toHaveText([/Drink water/, /Morning inbox/, /Weekly report/, /Invoice reminder/]);
});

test("the Schedules tab and a schedule's tab come back after a reload", async ({ page }) => {
    await scheduleWorkspace(page);

    await page.goto('/schedules');
    await scheduleRow(page, 'Morning inbox').getByRole('link', { name: 'Morning inbox' }).click();
    await expect(page).toHaveURL(/\/projects\/p-health\/schedules\/s-inbox$/);
    await expect(tabLinks(page)).toHaveText(['Schedules', 'Morning inbox']);

    await page.reload();

    await expect(tabLinks(page)).toHaveText(['Schedules', 'Morning inbox']);
    await expect(tab(page, 'Morning inbox')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Morning inbox');
});

test("a schedule the agent removed loses its tab while another screen shows; while its page shows, the page says it's gone", async ({
    page,
}) => {
    const daemon = await scheduleWorkspace(page);

    await page.goto('/projects/p-health/schedules/s-report');
    await expect(tabLinks(page)).toHaveText(['Weekly report']);
    await page.goto('/projects/p-health/schedules/s-inbox');
    await expect(tabLinks(page)).toHaveText(['Weekly report', 'Morning inbox']);

    daemon.schedules = daemon.schedules.filter(schedule => schedule.id === 's-invoices');
    await expect.poll(() => daemon.streaming).toBe(true);
    daemon.emit({ type: 'schedulesChanged', projectId: 'p-health' });

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This schedule is gone');
    await expect(tabLinks(page)).toHaveText(['Morning inbox']);

    await main(page).getByRole('link', { name: 'Back to Schedules' }).click();
    await expect(page).toHaveURL(/\/schedules$/);
    await expect(tabLinks(page)).toHaveText(['Schedules']);
});

function main(page: Page) {
    return page.getByRole('main');
}

function scheduleRows(page: Page) {
    return page
        .getByRole('table', { name: 'Schedules' })
        .getByRole('row')
        .filter({ has: page.getByRole('cell') });
}

function scheduleRow(page: Page, name: string) {
    return scheduleRows(page).filter({ has: page.getByRole('link', { name, exact: true }) });
}

function scheduleSwitch(page: Page, name: string) {
    return scheduleRow(page, name).getByRole('switch', { name });
}

function tabLinks(page: Page) {
    return page.getByRole('navigation', { name: 'Open tabs' }).getByRole('link');
}

function tab(page: Page, name: string) {
    return tabLinks(page).filter({ hasText: name });
}
