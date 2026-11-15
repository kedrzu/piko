import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { ACCOUNT_EMAIL, StubDaemon } from '../StubDaemon.js';

const PLAN_MARKDOWN = '# Plan\n\nWalk every morning.\n';
/** Plan.md as the agent of one conversation writes in it; with the state, a `fileAgentChanged` event. */
const PLAN_AGENT = {
    type: 'fileAgentChanged',
    projectId: 'p-health',
    path: 'Plan.md',
    conversationId: 'ses-plan',
} as const;
/** A 1×1 PNG. */
const PNG_BYTES = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
);
const PDF_BYTES = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

test('a Markdown file opens in the editor, and what the person types is saved a moment later', async ({ page }) => {
    const daemon = await workspace(page);

    await openFile(page, 'Plan.md');
    await typeAtEndOf(page, 'Walk every morning.', ' Twice.');

    await expect
        .poll(() => daemon.fileWrites.at(-1))
        .toEqual({
            projectId: 'p-health',
            path: 'Plan.md',
            content: '# Plan\n\nWalk every morning. Twice.\n',
        });
    // Opening and reading the file wrote nothing of its own.
    expect(daemon.fileWrites).toHaveLength(1);
});

test('a failed save keeps the text under Not saved; Try again saves it', async ({ page }) => {
    const daemon = await workspace(page);
    daemon.fileWriteFails = true;

    await openFile(page, 'Plan.md');
    await typeAtEndOf(page, 'Walk every morning.', ' Twice.');

    const banner = page.getByRole('alert').filter({ hasText: 'Not saved' });
    await expect(banner).toBeVisible();
    await expect(editor(page, 'Plan')).toContainText('Walk every morning. Twice.');
    expect(daemon.fileWrites).toHaveLength(0);

    daemon.fileWriteFails = false;
    await banner.getByRole('button', { name: 'Try again' }).click();

    await expect(banner).toBeHidden();
    expect(daemon.fileWrites.at(-1)?.content).toBe('# Plan\n\nWalk every morning. Twice.\n');
});

test('an image and a PDF show previews of their bytes', async ({ page }) => {
    await workspace(page);

    await openFile(page, 'cover.png');
    const image = page.getByRole('img', { name: 'cover.png' });
    await expect(image).toHaveAttribute('src', /^blob:/);
    await expect
        .poll(() => image.evaluate(element => element instanceof HTMLImageElement && element.naturalWidth))
        .toBe(1);
    await expect(page.getByText('Image · last changed')).toBeVisible();

    await openFile(page, 'contract.pdf');
    await expect(page.locator('iframe[title="contract.pdf"]')).toHaveAttribute('src', /^blob:/);
});

test('a text file shows as it is written, a CSV file as a table', async ({ page }) => {
    await workspace(page);

    await openFile(page, 'shopping.txt');
    await expect(page.getByText('- bananas', { exact: false })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);

    await openFile(page, 'results.csv');
    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader')).toHaveText(['date', 'steps', 'note']);
    await expect(table.getByRole('row').nth(2).getByRole('cell')).toHaveText([
        '2026-11-02',
        '10400',
        'Walk, then pool',
    ]);
});

test('a file the app cannot show offers Open in default app', async ({ page }) => {
    const daemon = await workspace(page);

    await openFile(page, 'budget.xlsx');
    await page.getByRole('button', { name: 'Open in default app' }).click();

    await expect.poll(() => daemon.filesOpened).toEqual([{ projectId: 'p-health', path: 'budget.xlsx' }]);
});

test('a file deleted while open says it is gone and takes no more typing', async ({ page }) => {
    const daemon = await workspace(page);

    await openFile(page, 'Plan.md');
    await expect(editor(page, 'Plan')).toContainText('Walk every morning.');
    daemon.projectFiles['p-health'] = (daemon.projectFiles['p-health'] ?? []).filter(path => path !== 'Plan.md');
    daemon.emit({ type: 'projectFilesChanged', projectId: 'p-health' });

    await expect(page.getByRole('alert').filter({ hasText: 'This file is gone' })).toBeVisible();
    await expect(editor(page, 'Plan')).toHaveAttribute('aria-readonly', 'true');
    await expect(editor(page, 'Plan')).toContainText('Walk every morning.');
    expect(daemon.fileWrites).toHaveLength(0);
});

test("the agent's change to another part of the file merges with the person's typing and is saved", async ({
    page,
}) => {
    const daemon = await workspace(page);

    await openFile(page, 'Plan.md');
    await expect(editor(page, 'Plan')).toContainText('Walk every morning.');
    // Not announced: the person's save finds the file changed and merges with it.
    setPlan(daemon, '# Health plan\n\nWalk every morning.\n');
    await typeAtEndOf(page, 'Walk every morning.', ' Twice.');

    // Recorded only when made on the file's version on disk.
    await expect.poll(() => daemon.fileWrites.at(-1)?.content).toBe('# Health plan\n\nWalk every morning. Twice.\n');
    expect(daemon.fileWrites).toHaveLength(1);
    await expect(editor(page, 'Plan')).toContainText('Health plan');
    await expect(page.getByRole('alert')).toHaveCount(0);
});

test("the agent's change to the same line asks first; Keep mine saves the person's text over it", async ({ page }) => {
    const daemon = await workspace(page);

    const banner = await conflictOnPlan(page, daemon);
    await expect(editor(page, 'Plan')).toContainText('Walk every morning. Twice.');
    expect(daemon.fileWrites).toHaveLength(0);

    await banner.getByRole('button', { name: 'Keep mine' }).click();

    await expect(banner).toBeHidden();
    await expect.poll(() => daemon.fileWrites.at(-1)?.content).toBe('# Plan\n\nWalk every morning. Twice.\n');
    expect(daemon.fileWrites).toHaveLength(1);
});

test("the agent's change to the same line asks first; Take the agent's shows it and saves nothing", async ({
    page,
}) => {
    const daemon = await workspace(page);

    const banner = await conflictOnPlan(page, daemon);
    await banner.getByRole('button', { name: "Take the agent's" }).click();

    await expect(banner).toBeHidden();
    await expect(editor(page, 'Plan')).toContainText('Run on Sundays.');
    await expect(editor(page, 'Plan')).not.toContainText('Twice.');
    // The next edit is made on the agent's text: nothing was written in between.
    await typeAtEndOf(page, 'Run on Sundays.', ' Often.');
    await expect.poll(() => daemon.fileWrites.at(-1)?.content).toBe('# Plan\n\nRun on Sundays. Often.\n');
    expect(daemon.fileWrites).toHaveLength(1);
});

test('while the agent writes in the file, editing is off and Stop the agent stops it; once done the file reloads', async ({
    page,
}) => {
    const daemon = await workspace(page);
    await openFile(page, 'Plan.md');
    await expect(editor(page, 'Plan')).toContainText('Walk every morning.');

    daemon.emit({ ...PLAN_AGENT, state: 'writing' });

    const banner = page.getByRole('status').filter({ hasText: 'The agent is writing in this file' });
    await expect(banner).toBeVisible();
    await expect(editor(page, 'Plan')).toHaveAttribute('aria-readonly', 'true');

    await banner.getByRole('button', { name: 'Stop the agent' }).click();
    await expect.poll(() => daemon.stopped).toEqual([PLAN_AGENT.conversationId]);

    // Not announced as a change of the project's files: the end of the agent's writing reads the file again.
    setPlan(daemon, '# Plan\n\nRun on Sundays.\n');
    daemon.emit({ ...PLAN_AGENT, state: null });

    await expect(banner).toBeHidden();
    await expect(editor(page, 'Plan')).toHaveAttribute('aria-readonly', 'false');
    await expect(editor(page, 'Plan')).toContainText('Run on Sundays.');
    expect(daemon.fileWrites).toHaveLength(0);
});

test('what the person typed is saved at once when the agent starts writing in the file', async ({ page }) => {
    const daemon = await workspace(page);
    await openFile(page, 'Plan.md');
    await typeAtEndOf(page, 'Walk every morning.', ' Twice.');

    daemon.emit({ ...PLAN_AGENT, state: 'writing' });

    // Sooner than the pause after typing that saves it otherwise.
    await expect
        .poll(() => daemon.fileWrites.map(write => write.content), { timeout: 700 })
        .toEqual(['# Plan\n\nWalk every morning. Twice.\n']);
    await expect(page.getByRole('status').filter({ hasText: 'The agent is writing in this file' })).toBeVisible();
    await expect(editor(page, 'Plan')).toHaveAttribute('aria-readonly', 'true');
});

test('while the agent waits for the person to stop typing, she keeps editing and can let it write now', async ({
    page,
}) => {
    const daemon = await workspace(page);
    await openFile(page, 'Plan.md');
    await expect(editor(page, 'Plan')).toContainText('Walk every morning.');

    daemon.emit({ ...PLAN_AGENT, state: 'waiting' });

    const banner = page.getByRole('status').filter({ hasText: 'The agent is waiting to change this file' });
    await expect(banner).toBeVisible();
    await expect(editor(page, 'Plan')).toHaveAttribute('aria-readonly', 'false');
    await typeAtEndOf(page, 'Walk every morning.', ' Twice.');
    await expect.poll(() => daemon.fileWrites.length).toBe(1);

    await banner.getByRole('button', { name: 'Let it write now' }).click();
    const plan = { projectId: 'p-health', path: 'Plan.md' };
    await expect.poll(() => daemon.filesReleased).toEqual([plan]);

    // Closing the file's tab lets the agent write it too.
    await page.getByRole('button', { name: 'Close Plan' }).click();
    await expect.poll(() => daemon.filesReleased).toEqual([plan, plan]);
});

/** A project with one file of each kind the screen shows, Claude signed in. */
async function workspace(page: Page) {
    const daemon = await StubDaemon.install(page);
    daemon.claude = { connected: true, email: ACCOUNT_EMAIL, plan: 'max', planAllowed: true };
    daemon.projects = [{ id: 'p-health', name: 'Health' }];
    daemon.projectFiles['p-health'] = [
        'Plan.md',
        'shopping.txt',
        'results.csv',
        'cover.png',
        'contract.pdf',
        'budget.xlsx',
    ];
    daemon.fileContents['p-health'] = {
        'Plan.md': PLAN_MARKDOWN,
        'shopping.txt': 'Saturday\n- oats\n- bananas\n',
        'results.csv': 'date,steps,note\n2026-11-01,8200,\n2026-11-02,10400,"Walk, then pool"\n',
        'cover.png': PNG_BYTES,
        'contract.pdf': PDF_BYTES,
        'budget.xlsx': Buffer.from('PK'),
    };
    return daemon;
}

/** The person types in Plan.md, and the agent changes the same line before it is saved. */
async function conflictOnPlan(page: Page, daemon: StubDaemon) {
    await openFile(page, 'Plan.md');
    await typeAtEndOf(page, 'Walk every morning.', ' Twice.');
    setPlan(daemon, '# Plan\n\nRun on Sundays.\n');
    daemon.emit({ type: 'projectFilesChanged', projectId: 'p-health' });

    const banner = page.getByRole('alert').filter({ hasText: 'The agent changed this file meanwhile' });
    await expect(banner).toBeVisible();
    return banner;
}

function setPlan(daemon: StubDaemon, content: string) {
    daemon.fileContents['p-health'] = { ...daemon.fileContents['p-health'], 'Plan.md': content };
}

async function openFile(page: Page, path: string) {
    await page.goto(`/projects/p-health/files?path=${encodeURIComponent(path)}`);
}

function editor(page: Page, title: string) {
    return page.getByRole('textbox', { name: title });
}

async function typeAtEndOf(page: Page, text: string, typed: string) {
    await page.getByText(text).click();
    await page.keyboard.press('End');
    await page.keyboard.type(typed);
}
