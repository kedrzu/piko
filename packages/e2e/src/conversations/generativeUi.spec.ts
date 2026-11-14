import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import type { ConversationMessage } from '@poweragents/common/api/ConversationTypes.js';

import { ACCOUNT_EMAIL, StubDaemon } from '../StubDaemon.js';

const CHOICES = `Where do we start?

\`\`\`openui
root = Stack([intro, choices])
intro = Text("Pick a topic")
choices = Buttons([Button("Sleep", @ToAssistant("Let's start with sleep"), "primary"), Button("Movement", @ToAssistant("Let's start with movement"))])
\`\`\`
`;

const FORM = `\`\`\`openui
root = Stack([form])
form = Form("plan", [name, areas, note], [send])
name = TextInput("name", "Your name", "e.g. Ann", true)
areas = CheckboxGroup("areas", "Focus areas", ["Sleep", "Food", "Movement"])
note = TextArea("note", "Anything else?")
send = Button("Make the plan", @ToAssistant("Make me a plan"), "primary")
\`\`\`
`;

test('an agent reply with an openui block shows its controls, not the code', async ({ page }) => {
    await conversation(page, [user('m-1', 'Hello'), agent('a-1', CHOICES + FORM)]);

    await expect(messages(page).getByText('Where do we start?')).toBeVisible();
    await expect(messages(page).getByText('Pick a topic')).toBeVisible();
    // Only the last UI of a reply takes answers.
    await expect(messages(page).getByRole('button', { name: 'Sleep' })).toBeDisabled();
    await expect(messages(page).getByRole('textbox', { name: 'Your name' })).toBeEnabled();
    await expect(messages(page).getByText('root = Stack')).toBeHidden();
});

test('a block streamed in chunks shows its controls before it ends, disabled until the run ends', async ({ page }) => {
    const daemon = await conversation(page, [user('m-1', 'Hello')], true);

    const chunks = [
        'Where do we start?\n\n```openui\nroot = Stack([choices])\n',
        'choices = Buttons([Button("Sleep", @ToAssistant("Let\'s start with sleep"), "primary"), ',
        'Button("Movement", @ToAssistant("Let\'s start with movement"))])\n',
        '```\n',
    ];
    for (const delta of chunks.slice(0, 3)) {
        daemon.emit({ type: 'textDelta', conversationId: 'c-1', messageId: 'a-1', delta });
    }
    // The closing fence has not come yet.
    await expect(messages(page).getByRole('button', { name: 'Sleep' })).toBeDisabled();
    await expect(messages(page).getByRole('button', { name: 'Movement' })).toBeDisabled();
    await expect(messages(page).getByText('root = Stack')).toBeHidden();

    daemon.emit({ type: 'textDelta', conversationId: 'c-1', messageId: 'a-1', delta: chunks[3] ?? '' });
    await expect(messages(page).getByRole('button', { name: 'Sleep' })).toBeDisabled();

    daemon.messages['c-1'] = [
        user('m-1', 'Hello'),
        agent('a-1', chunks.join('')),
        { type: 'runEnd', id: 'e-1', createdAt: 3, outcome: 'succeeded' },
    ];
    daemon.setRunning('c-1', false);
    daemon.emit({ type: 'runFinished', conversationId: 'c-1', outcome: 'succeeded' });
    await expect(messages(page).getByRole('button', { name: 'Sleep' })).toBeEnabled();
    await expect(messages(page).getByRole('button', { name: 'Movement' })).toBeEnabled();
});

test('clicking a button sends exactly its action text, then the earlier UI is inactive for good', async ({ page }) => {
    const daemon = await conversation(page, [user('m-1', 'Hello'), agent('a-1', CHOICES)]);
    await composer(page).fill('A draft I am still writing');

    await messages(page).getByRole('button', { name: 'Movement' }).click();

    await expect
        .poll(() => daemon.sent)
        .toEqual([{ conversationId: 'c-1', text: "Let's start with movement", queued: false }]);
    await expect(composer(page)).toHaveValue('A draft I am still writing');
    await expect(messages(page).getByRole('button', { name: 'Sleep' })).toBeDisabled();
    // The earlier UI shows what was picked.
    await expect(messages(page).getByRole('button', { name: 'Movement' })).toHaveAttribute('aria-pressed', 'true');
    await expect(messages(page).getByRole('button', { name: 'Sleep' })).not.toHaveAttribute('aria-pressed');

    // The run ends with no new UI: the person's message is the last, so the old buttons stay inactive.
    daemon.setRunning('c-1', false);
    daemon.emit({ type: 'runFinished', conversationId: 'c-1', outcome: 'succeeded' });
    await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden();
    await expect(messages(page).getByRole('button', { name: 'Sleep' })).toBeDisabled();
    await messages(page).getByRole('button', { name: 'Sleep' }).click({ force: true });
    expect(daemon.sent).toHaveLength(1);
});

test('a form sends its action text and the filled values; with a required field empty it sends nothing', async ({
    page,
}) => {
    const daemon = await conversation(page, [user('m-1', 'Hello'), agent('a-1', FORM)]);

    await messages(page).getByRole('checkbox', { name: 'Movement' }).check();
    await messages(page).getByRole('button', { name: 'Make the plan' }).click();
    const name = messages(page).getByRole('textbox', { name: 'Your name' });
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(messages(page).getByText('Fill this in')).toBeVisible();
    expect(daemon.sent).toEqual([]);

    await name.fill('Ann');
    await messages(page).getByRole('checkbox', { name: 'Sleep' }).check();
    await messages(page).getByRole('button', { name: 'Make the plan' }).click();

    await expect
        .poll(() => daemon.sent)
        .toEqual([
            {
                conversationId: 'c-1',
                text: 'Make me a plan\n\nYour name: Ann\nFocus areas: Sleep, Movement',
                queued: false,
            },
        ]);
});

test('a message typed after the reply makes its UI inactive; stopping a queued message makes it active again', async ({
    page,
}) => {
    const daemon = await conversation(page, [user('m-1', 'Hello'), agent('a-1', CHOICES)]);
    await expect(messages(page).getByRole('button', { name: 'Sleep' })).toBeEnabled();
    await expect(composer(page)).toHaveAttribute('placeholder', /^Or\sanswer\sin\syour\sown\swords…$/);

    await composer(page).fill('Actually, something else');
    await composer(page).press('Enter');
    await expect(messages(page).getByRole('button', { name: 'Sleep' })).toBeDisabled();
    daemon.setRunning('c-1', false);
    daemon.emit({ type: 'runFinished', conversationId: 'c-1', outcome: 'succeeded' });
    await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden();
    await expect(messages(page).getByRole('button', { name: 'Sleep' })).toBeDisabled();
    await expect(composer(page)).toHaveAttribute('placeholder', /^Write\sto\sthe\sagent…$/);
    await messages(page).getByRole('button', { name: 'Sleep' }).click({ force: true });
    expect(daemon.sent).toEqual([{ conversationId: 'c-1', text: 'Actually, something else', queued: false }]);
});

test('a message waiting in the queue disables the UI, and Stop withdrawing it enables it again', async ({ page }) => {
    const daemon = await conversation(page, [user('m-1', 'Hello'), agent('a-1', CHOICES)], true);
    await expect(messages(page).getByRole('button', { name: 'Sleep' })).toBeDisabled();

    await composer(page).fill('Wait, one more thing');
    await composer(page).press('Enter');
    await expect(messages(page).getByText('Wait, one more thing')).toBeVisible();
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(composer(page)).toHaveValue('Wait, one more thing');
    await expect(messages(page).getByRole('button', { name: 'Sleep' })).toBeEnabled();

    await messages(page).getByRole('button', { name: 'Sleep' }).click();
    await expect
        .poll(() => daemon.sent.at(-1))
        .toEqual({
            conversationId: 'c-1',
            text: "Let's start with sleep",
            queued: false,
        });
    await expect(composer(page)).toHaveValue('Wait, one more thing');
});

/** Opens conversation `c-1` of project Health, holding `history`, with the agent working on it or not. */
async function conversation(page: Page, history: ConversationMessage[], running = false) {
    const daemon = await StubDaemon.install(page);
    daemon.claude = { connected: true, email: ACCOUNT_EMAIL, plan: 'max', planAllowed: true };
    daemon.projects = [{ id: 'p-health', name: 'Health' }];
    daemon.conversations['p-health'] = [{ id: 'c-1', title: 'Morning plan', updatedAt: 1, running }];
    daemon.messages['c-1'] = history;

    await page.goto('/projects/p-health/conversations/c-1');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Morning plan');
    await expect.poll(() => daemon.streaming).toBe(true);
    return daemon;
}

function user(id: string, text: string): ConversationMessage {
    return { type: 'user', id, createdAt: 1, text };
}

function agent(id: string, text: string): ConversationMessage {
    return { type: 'agent', id, createdAt: 2, parts: [{ type: 'text', text }] };
}

function composer(page: Page) {
    return page.getByRole('textbox', { name: 'Message to the agent' });
}

function messages(page: Page) {
    return page.getByRole('region', { name: 'Messages' });
}
