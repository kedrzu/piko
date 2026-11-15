import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { ACCOUNT_EMAIL, StubDaemon } from '../StubDaemon.js';

test('an open project lists its files under its conversations; a folder expands in place', async ({ page }) => {
    await workspace(page);

    await page.goto('/projects/p-health');
    await expect(sidebar(page).getByRole('heading')).toHaveText(['Projects', 'Conversations', 'Files']);
    await expect(files(page).getByRole('listitem')).toHaveText(['notes', 'Plan', 'results.csv']);

    await folder(page, 'notes').click();
    await expect(folder(page, 'notes')).toHaveAttribute('aria-expanded', 'true');
    await expect(files(page).getByRole('listitem')).toHaveText(['notes', 'Post ideas', 'Plan', 'results.csv']);

    await folder(page, 'notes').click();
    await expect(files(page).getByRole('listitem')).toHaveText(['notes', 'Plan', 'results.csv']);
});

test('a change in the files shows without a reload, and an expanded folder stays expanded', async ({ page }) => {
    const daemon = await workspace(page);

    await page.goto('/projects/p-health');
    await folder(page, 'notes').click();
    await expect(files(page).getByRole('listitem')).toHaveText(['notes', 'Post ideas', 'Plan', 'results.csv']);

    daemon.projectFiles['p-health'] = [...(daemon.projectFiles['p-health'] ?? []), 'notes/Diet.md', 'cover.png'];
    daemon.emit({ type: 'projectFilesChanged', projectId: 'p-health' });

    await expect(files(page).getByRole('listitem')).toHaveText([
        'notes',
        'Diet',
        'Post ideas',
        'cover.png',
        'Plan',
        'results.csv',
    ]);
    await expect(folder(page, 'notes')).toHaveAttribute('aria-expanded', 'true');

    // A folder gone is gone from the tree.
    daemon.projectFiles['p-health'] = ['Plan.md'];
    daemon.emit({ type: 'projectFilesChanged', projectId: 'p-health' });
    await expect(files(page).getByRole('listitem')).toHaveText(['Plan']);
});

test('a click on a file opens it in its tab; its row is the selected one, not New conversation', async ({ page }) => {
    await workspace(page);

    await page.goto('/projects/p-health');
    await folder(page, 'notes').click();
    await files(page).getByRole('link', { name: 'Post ideas', exact: true }).click();

    await expect(page).toHaveURL(/\/projects\/p-health\/files\?path=notes\/Post(\+|%20)ideas\.md$/);
    await expect(
        page.getByRole('navigation', { name: 'Open tabs' }).getByRole('link', { name: 'Post ideas', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(files(page).getByRole('link', { name: 'Post ideas', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
    );
    await expect(sidebar(page).getByRole('link', { name: 'New conversation', exact: true })).not.toHaveAttribute(
        'aria-current',
    );
    await expect(sidebar(page).getByRole('link', { name: 'Health', exact: true })).toHaveAttribute(
        'aria-current',
        'true',
    );
});

test('a project without files says so', async ({ page }) => {
    const daemon = await workspace(page);
    daemon.projectFiles['p-health'] = [];

    await page.goto('/projects/p-health');
    await expect(sidebar(page).getByText('No files yet')).toBeVisible();
});

/** A project with a conversation and files in a folder, Claude signed in. */
async function workspace(page: Page) {
    const daemon = await StubDaemon.install(page);
    daemon.claude = { connected: true, email: ACCOUNT_EMAIL, plan: 'max', planAllowed: true };
    daemon.projects = [{ id: 'p-health', name: 'Health' }];
    daemon.conversations['p-health'] = [
        { id: 'c-morning', title: 'Morning plan', updatedAt: 1, running: false, provider: 'claude' },
    ];
    daemon.projectFiles['p-health'] = ['Plan.md', 'results.csv', 'notes/Post ideas.md'];
    return daemon;
}

function sidebar(page: Page) {
    return page.getByRole('navigation', { name: 'Projects' });
}

function files(page: Page) {
    return sidebar(page).getByRole('list', { name: 'Files' });
}

function folder(page: Page, name: string) {
    return files(page).getByRole('button', { name, exact: true });
}
