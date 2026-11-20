import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import type { ConversationMessage, ConversationStepStatus } from '@piko/common/api/ConversationTypes.js';

import { ACCOUNT_EMAIL, StubDaemon } from '../StubDaemon.js';

const REPLY_TEXT = 'The plan is in notes/plan.md.';
const CONVERSATION_URL = /\/projects\/p-health\/conversations\/c-1$/;
const SIDE_VIEW_URL = /\/projects\/p-health\/conversations\/c-1\?file=notes\/plan\.md$/;
const TAB_URL = /\/projects\/p-health\/files\?path=notes\/plan\.md$/;

test('a chip under the reply opens its file beside the conversation; Close closes it', async ({ page }) => {
    const daemon = await conversation(page);

    await expect(page.getByText(REPLY_TEXT)).toBeVisible();
    await expect(chip(page)).toContainText('Health');
    await chip(page).click();

    await expect(page).toHaveURL(SIDE_VIEW_URL);
    await expect(editor(page)).toContainText('Walk every morning.');
    // The conversation stays: its messages and the composer beside the file.
    await expect(page.getByText(REPLY_TEXT)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message to the agent' })).toBeVisible();
    // Still the conversation's tab, not a tab of the file.
    await expect(tabLinks(page)).toHaveText(['Morning plan']);

    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await expect(page).toHaveURL(CONVERSATION_URL);
    await expect(editor(page)).toHaveCount(0);
    await expect(page.getByText(REPLY_TEXT)).toBeVisible();
    // Closed, the file no longer holds the agent's change.
    await expect.poll(() => daemon.filesReleased).toEqual([{ projectId: 'p-health', path: 'notes/plan.md' }]);
});

test('Open as a tab moves the file into its tab with what was just typed, saved', async ({ page }) => {
    const daemon = await conversation(page);
    await chip(page).click();
    await expect(editor(page)).toContainText('Walk every morning.');

    await page.getByText('Walk every morning.').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Twice.');
    // Before the autosave's delay runs out.
    await page.getByRole('button', { name: 'Open as a tab' }).click();

    await expect(page).toHaveURL(TAB_URL);
    await expect(tabLinks(page)).toHaveText(['Morning plan', 'plan']);
    await expect(tab(page, 'plan')).toHaveAttribute('aria-current', 'page');
    await expect(editor(page)).toContainText('Walk every morning. Twice.');
    expect(daemon.fileWrites.at(-1)).toEqual({
        projectId: 'p-health',
        path: 'notes/plan.md',
        content: '# Plan\n\nWalk every morning. Twice.\n',
    });
});

test('a chip of a file open in a tab shows that tab, not a second editor beside the conversation', async ({ page }) => {
    await conversation(page);
    await page.goto('/projects/p-health/files?path=notes%2Fplan.md');
    await tab(page, 'Morning plan').click();
    await expect(page).toHaveURL(CONVERSATION_URL);

    await chip(page).click();

    await expect(page).toHaveURL(TAB_URL);
    await expect(tab(page, 'plan')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: 'Open as a tab' })).toHaveCount(0);
});

test('a chip reads "writing…" while the step writing its file runs', async ({ page }) => {
    await conversation(page, 'running');

    await expect(chip(page)).toContainText('writing…');
    await expect(chip(page)).not.toContainText('Health');
});

/** Opens conversation `c-1` of Health, whose reply writes notes/plan.md in a step with `stepStatus`. */
async function conversation(page: Page, stepStatus: ConversationStepStatus = 'done') {
    const daemon = await StubDaemon.install(page);
    const running = stepStatus === 'running';
    daemon.claude = { connected: true, email: ACCOUNT_EMAIL, plan: 'max', planAllowed: true };
    daemon.projects = [{ id: 'p-health', name: 'Health' }];
    daemon.projectFiles['p-health'] = ['notes/plan.md'];
    daemon.fileContents['p-health'] = { 'notes/plan.md': '# Plan\n\nWalk every morning.\n' };
    daemon.conversations['p-health'] = [
        { id: 'c-1', title: 'Morning plan', updatedAt: 1, running, provider: 'claude' },
    ];
    const messages: ConversationMessage[] = [
        { type: 'user', id: 'm-1', createdAt: 1, text: 'Write me a morning plan' },
        {
            type: 'agent',
            id: 'a-1',
            createdAt: 2,
            parts: [
                { type: 'step', id: 's-1', kind: 'writeFile', target: 'notes/plan.md', status: stepStatus },
                { type: 'text', text: REPLY_TEXT },
            ],
        },
    ];
    daemon.messages['c-1'] = messages;

    await page.goto('/projects/p-health/conversations/c-1');
    await expect.poll(() => daemon.streaming).toBe(true);
    return daemon;
}

function chip(page: Page) {
    return page.getByRole('link', { name: /^Open beside the conversation: plan / });
}

function editor(page: Page) {
    return page.getByRole('textbox', { name: 'plan', exact: true });
}

function tabLinks(page: Page) {
    return page.getByRole('navigation', { name: 'Open tabs' }).getByRole('link');
}

function tab(page: Page, name: string) {
    return page.getByRole('navigation', { name: 'Open tabs' }).getByRole('link', { name, exact: true });
}
