import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { ACCOUNT_EMAIL, StubDaemon } from '../StubDaemon.js';

test.use({ locale: 'pl-PL' });

test('a command of a plugin not installed shows with a note why it did not run, and the next message continues', async ({
    page,
}) => {
    const daemon = await StubDaemon.install(page);
    daemon.claude = { connected: true, email: ACCOUNT_EMAIL, plan: 'max', planAllowed: true };
    daemon.missingPlugins = ['kalendarz'];
    daemon.projects = [{ id: 'p-health', name: 'Health' }];
    daemon.conversations['p-health'] = [{ id: 'c-1', title: 'Plan dnia', updatedAt: 1, running: false }];
    daemon.messages['c-1'] = [
        { type: 'user', id: 'm-1', createdAt: 1, text: 'Cześć' },
        { type: 'agent', id: 'a-1', createdAt: 2, parts: [{ type: 'text', text: 'W czym pomóc?' }] },
    ];
    await page.goto('/projects/p-health/conversations/c-1');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan dnia');
    await expect.poll(() => daemon.streaming).toBe(true);

    await composer(page).fill('/kalendarz:plan-tygodnia');
    await composer(page).press('Enter');

    const prompt = messages(page).getByText('/kalendarz:plan-tygodnia', { exact: true });
    const note = messages(page).getByText('Plugin kalendarz nie jest zainstalowany, więc ta komenda nie została');
    await expect(prompt).toBeVisible();
    await expect(note).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zatrzymaj' })).toBeHidden();
    await expect(composer(page)).toHaveValue('');

    // The plugin installed again, the person writes: the waiting command goes to the agent with it.
    await composer(page).fill('Już zainstalowałam, działaj');
    await composer(page).press('Enter');

    await expect(page.getByRole('button', { name: 'Zatrzymaj' })).toBeVisible();
    await expect(messages(page).getByText('Już zainstalowałam, działaj')).toBeVisible();
    await expect(prompt).toHaveCount(1);
    await expect(note).toBeVisible();
    expect(daemon.sent).toEqual([
        expect.objectContaining({ text: '/kalendarz:plan-tygodnia' }),
        expect.objectContaining({ text: 'Już zainstalowałam, działaj' }),
    ]);
    const promptBox = await prompt.boundingBox();
    const noteBox = await note.boundingBox();
    const nextBox = await messages(page).getByText('Już zainstalowałam, działaj').boundingBox();
    expect(promptBox && noteBox && nextBox && promptBox.y < noteBox.y && noteBox.y < nextBox.y).toBe(true);
});

function composer(page: Page) {
    return page.getByRole('textbox', { name: 'Wiadomość do agenta' });
}

function messages(page: Page) {
    return page.getByRole('region', { name: 'Wiadomości' });
}
