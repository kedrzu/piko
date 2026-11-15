import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { ACCOUNT_EMAIL, StubDaemon } from '../StubDaemon.js';

test('each screen opened gets a tab; a click on a tab shows it, closing the active one shows its neighbour', async ({
    page,
}) => {
    await workspace(page);

    await page.goto('/projects/p-health/conversations/c-morning');
    await sidebarLink(page, 'Evening plan').click();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Memory' }).click();
    await expect(tabLinks(page)).toHaveText(['Morning plan', 'Evening plan', 'Memory']);
    await expect(tab(page, 'Memory')).toHaveAttribute('aria-current', 'page');

    await tab(page, 'Morning plan').click();
    await expect(page).toHaveURL(/\/projects\/p-health\/conversations\/c-morning$/);
    await expect(tab(page, 'Morning plan')).toHaveAttribute('aria-current', 'page');
    await expect(sidebarLink(page, 'Morning plan')).toHaveAttribute('aria-current', 'page');
    // Only the active tab can be closed.
    await expect(tabs(page).getByRole('button')).toHaveCount(1);

    await tabs(page).getByRole('button', { name: 'Close Morning plan' }).click();
    await expect(page).toHaveURL(/\/projects\/p-health\/conversations\/c-evening$/);
    await expect(tabLinks(page)).toHaveText(['Evening plan', 'Memory']);

    // The last tab of a row closes to the one on its left.
    await tab(page, 'Memory').click();
    await tabs(page).getByRole('button', { name: 'Close Memory' }).click();
    await expect(page).toHaveURL(/\/projects\/p-health\/conversations\/c-evening$/);
    await expect(tabLinks(page)).toHaveText(['Evening plan']);
});

test("the tabs come back after a reload, without a conversation gone meanwhile; the sidebar follows the active tab's project", async ({
    page,
}) => {
    const daemon = await workspace(page);
    daemon.projectFiles['p-health'] = ['notes/Post ideas.md'];

    await page.goto('/projects/p-work/conversations/c-cover');
    await sidebarLink(page, 'Health').click();
    await sidebarLink(page, 'Morning plan').click();
    await sidebarLink(page, 'Evening plan').click();
    await expect(page).toHaveURL(/\/conversations\/c-evening$/);
    await page.goto('/projects/p-health/files?path=notes/Post%20ideas.md');
    await expect(tabLinks(page)).toHaveText([
        'Cover letter',
        'New conversation',
        'Morning plan',
        'Evening plan',
        'Post ideas',
    ]);

    daemon.conversations['p-health'] = daemon.conversations['p-health']!.filter(item => item.id !== 'c-evening');
    await tab(page, 'Morning plan').click();
    await expect(page).toHaveURL(/\/conversations\/c-morning$/);
    await page.reload();

    // Cover letter's project is not open: its tab keeps the title it had.
    await expect(tabLinks(page)).toHaveText(['Cover letter', 'New conversation', 'Morning plan', 'Post ideas']);
    await expect(tab(page, 'Morning plan')).toHaveAttribute('aria-current', 'page');

    await tab(page, 'Cover letter').click();
    await expect(page).toHaveURL(/\/projects\/p-work\/conversations\/c-cover$/);
    await expect(sidebarLink(page, 'Work')).toHaveAttribute('aria-current', 'true');
    await expect(sidebarLink(page, 'Cover letter')).toHaveAttribute('aria-current', 'page');

    await tab(page, 'Post ideas').click();
    await expect(sidebarLink(page, 'Health')).toHaveAttribute('aria-current', /.+/);
});

test('a file tab whose file is gone disappears when the app loads; the tab of an existing file stays', async ({
    page,
}) => {
    const daemon = await workspace(page);
    daemon.projectFiles['p-health'] = ['notes/Post ideas.md', 'notes/Old plan.md'];

    await page.goto('/projects/p-health/files?path=notes/Old%20plan.md');
    await expect(tabLinks(page)).toHaveText(['Old plan']);
    await page.goto('/projects/p-health/files?path=notes/Post%20ideas.md');
    await expect(tabLinks(page)).toHaveText(['Old plan', 'Post ideas']);

    daemon.projectFiles['p-health'] = ['notes/Post ideas.md'];
    await page.reload();

    await expect(tabLinks(page)).toHaveText(['Post ideas']);
});

test("a conversation started in a project's New conversation tab takes that tab's place", async ({ page }) => {
    await workspace(page);

    await page.goto('/projects/p-work');
    await expect(tabLinks(page)).toHaveText(['New conversation']);
    await page.getByRole('textbox', { name: 'Message to the agent' }).fill('Write my cover letter');
    await page.getByRole('textbox', { name: 'Message to the agent' }).press('Enter');

    await expect(page).toHaveURL(/\/projects\/p-work\/conversations\/c-1$/);
    // The agent works on it: its spinner is named too.
    await expect(tabLinks(page)).toHaveText([/Untitled conversation$/]);
});

/** Two projects with conversations, Claude signed in. */
async function workspace(page: Page) {
    const daemon = await StubDaemon.install(page);
    daemon.claude = { connected: true, email: ACCOUNT_EMAIL, plan: 'max', planAllowed: true };
    daemon.projects = [
        { id: 'p-health', name: 'Health' },
        { id: 'p-work', name: 'Work' },
    ];
    daemon.conversations['p-health'] = [
        { id: 'c-evening', title: 'Evening plan', updatedAt: 2, running: false, provider: 'claude' },
        { id: 'c-morning', title: 'Morning plan', updatedAt: 1, running: false, provider: 'claude' },
    ];
    daemon.conversations['p-work'] = [
        { id: 'c-cover', title: 'Cover letter', updatedAt: 1, running: false, provider: 'claude' },
    ];
    return daemon;
}

function tabs(page: Page) {
    return page.getByRole('navigation', { name: 'Open tabs' });
}

function tabLinks(page: Page) {
    return tabs(page).getByRole('link');
}

function tab(page: Page, name: string) {
    return tabs(page).getByRole('link', { name });
}

function sidebarLink(page: Page, name: string) {
    return page.getByRole('navigation', { name: 'Projects' }).getByRole('link', { name });
}
