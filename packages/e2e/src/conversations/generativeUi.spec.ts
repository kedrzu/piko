import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import type { ConversationMessage } from '@piko/common/api/ConversationTypes.js';
import { buildGenerativeUiAnswerText } from '@piko/common/generativeUi/GenerativeUiAnswer.js';
import type { GenerativeUiAnswer } from '@piko/common/generativeUi/GenerativeUiAnswer.js';

import { ACCOUNT_EMAIL, StubDaemon } from '../StubDaemon.js';

const CHOICES = `Where do we start?

\`\`\`openui
root = Stack([intro, choices])
intro = Text("Pick a topic")
choices = Buttons([Button("Sleep", "primary"), Button("Movement")])
\`\`\`
`;

/** A program from before answers were structured: its buttons carry the message they sent. */
const LEGACY_CHOICES = `Where do we start?

\`\`\`openui
root = Stack([choices])
choices = Buttons([Button("Sleep", @ToAssistant("Let's start with sleep"), "primary"), Button("Movement", @ToAssistant("Let's start with movement"))])
\`\`\`
`;

const FORM = `\`\`\`openui
root = Stack([intro, plan])
intro = Text("Tell me about you")
plan = Form("plan", [name, areas, level, note], [send, basics])
name = TextInput("name", "Your name", "e.g. Ann", true)
areas = CheckboxGroup("areas", "Focus areas", ["Sleep", "Food", "Movement"])
level = Select("level", "Intensity", ["Low", "High"])
note = TextArea("note", "Anything else?")
send = Button("Make the plan", "primary")
basics = Button("Just the basics")
\`\`\`
`;

/** A form with nothing required: it can be sent empty. */
const OPTIONAL_FORM = `\`\`\`openui
root = Stack([quick])
quick = Form("quick", [areas], [send])
areas = CheckboxGroup("areas", "Focus areas", ["Sleep", "Food"])
send = Button("Make the plan", "primary")
\`\`\`
`;

/** What the person filled in FORM, as the app records it: only the filled fields, in form order. */
const FILLED_ANSWER: GenerativeUiAnswer = {
    kind: 'generativeUiAnswer',
    source: 'form',
    name: 'plan',
    button: 'Make the plan',
    defaultButton: true,
    fields: [
        { name: 'name', label: 'Your name', value: 'Ann' },
        { name: 'areas', label: 'Focus areas', value: ['Sleep', 'Movement'] },
        { name: 'level', label: 'Intensity', value: 'High' },
    ],
};

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
        'choices = Buttons([Button("Sleep", "primary"), ',
        'Button("Movement")])\n',
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

test('clicking a button sends the choice as an answer, then the earlier UI is inactive for good', async ({ page }) => {
    const daemon = await conversation(page, [user('m-1', 'Hello'), agent('a-1', CHOICES)]);
    await composer(page).fill('A draft I am still writing');

    await messages(page).getByRole('button', { name: 'Movement' }).click();

    await expect
        .poll(() => daemon.sent)
        .toEqual([{ conversationId: 'c-1', answer: choiceAnswer('Movement'), queued: false }]);
    await expect(composer(page)).toHaveValue('A draft I am still writing');
    await expect(messages(page).getByRole('button', { name: 'Sleep' })).toBeDisabled();
    // The earlier UI shows what was picked, and the person's bubble says it in the label's words.
    await expect(messages(page).getByRole('button', { name: 'Movement' })).toHaveAttribute('aria-pressed', 'true');
    await expect(messages(page).getByRole('button', { name: 'Sleep' })).not.toHaveAttribute('aria-pressed');
    await expect(bubbleText(page, 'Movement')).toBeVisible();

    // The run ends with no new UI: the person's message is the last, so the old buttons stay inactive.
    daemon.setRunning('c-1', false);
    daemon.emit({ type: 'runFinished', conversationId: 'c-1', outcome: 'succeeded' });
    await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden();
    await expect(messages(page).getByRole('button', { name: 'Sleep' })).toBeDisabled();
    await expect(messages(page).getByRole('button', { name: 'Movement' })).toHaveAttribute('aria-pressed', 'true');
    await messages(page).getByRole('button', { name: 'Sleep' }).click({ force: true });
    expect(daemon.sent).toHaveLength(1);
});

test('a form sends one answer with its filled fields only, in order; with a required field empty it sends nothing', async ({
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
    await messages(page).getByRole('combobox', { name: 'Intensity' }).selectOption('High');
    await messages(page).getByRole('button', { name: 'Make the plan' }).click();

    // The empty note is left out; the checkbox group's value is a list in the form's order.
    await expect.poll(() => daemon.sent).toEqual([{ conversationId: 'c-1', answer: FILLED_ANSWER, queued: false }]);
});

test("submitting a form collapses it and shows the answer in the person's message, without a reload", async ({
    page,
}) => {
    const daemon = await conversation(page, [user('m-1', 'Hello'), agent('a-1', FORM)]);

    await messages(page).getByRole('textbox', { name: 'Your name' }).fill('Ann');
    await messages(page).getByRole('checkbox', { name: 'Sleep' }).check();
    await messages(page).getByRole('button', { name: 'Make the plan' }).click();

    await expect.poll(() => daemon.sent).toHaveLength(1);
    await expect(messages(page).getByRole('textbox', { name: 'Your name' })).toBeHidden();
    await expect(messages(page).getByRole('button', { name: 'Make the plan' })).toBeHidden();
    await expect(messages(page).getByText('Tell me about you')).toBeVisible();
    await expect(messages(page).getByRole('term')).toHaveText(['Your name', 'Focus areas']);
    await expect(messages(page).getByRole('definition')).toHaveText(['Ann', 'Sleep']);
    // Nothing the form did not show: no code, and no label of the default button.
    await expect(messages(page).getByText('generativeUiAnswer')).toBeHidden();
    await expect(messages(page).getByText('Make the plan')).toBeHidden();
});

test("a button that is not the form's first, or a form sent empty, shows its label in the person's message", async ({
    page,
}) => {
    const daemon = await conversation(page, [user('m-1', 'Hello'), agent('a-1', FORM)]);

    await messages(page).getByRole('textbox', { name: 'Your name' }).fill('Ann');
    await messages(page).getByRole('button', { name: 'Just the basics' }).click();

    await expect
        .poll(() => daemon.sent)
        .toEqual([
            {
                conversationId: 'c-1',
                answer: {
                    kind: 'generativeUiAnswer',
                    source: 'form',
                    name: 'plan',
                    button: 'Just the basics',
                    defaultButton: false,
                    fields: [{ name: 'name', label: 'Your name', value: 'Ann' }],
                },
                queued: false,
            },
        ]);
    await expect(messages(page).getByRole('definition')).toHaveText(['Ann']);
    await expect(bubbleText(page, 'Just the basics')).toBeVisible();
});

test("a form sent with nothing filled shows the clicked button in the person's message", async ({ page }) => {
    const daemon = await conversation(page, [user('m-1', 'Hello'), agent('a-1', OPTIONAL_FORM)]);

    await messages(page).getByRole('button', { name: 'Make the plan' }).click();

    await expect
        .poll(() => daemon.sent)
        .toEqual([
            {
                conversationId: 'c-1',
                answer: {
                    kind: 'generativeUiAnswer',
                    source: 'form',
                    name: 'quick',
                    button: 'Make the plan',
                    defaultButton: true,
                    fields: [],
                },
                queued: false,
            },
        ]);
    await expect(messages(page).getByRole('checkbox')).toHaveCount(0);
    await expect(bubbleText(page, 'Make the plan')).toBeVisible();
});

test("a form answered in the history is not shown again; the person's message shows each answer", async ({ page }) => {
    const answer: GenerativeUiAnswer = {
        kind: 'generativeUiAnswer',
        source: 'form',
        name: 'plan',
        button: 'Make the plan',
        defaultButton: true,
        fields: [
            { name: 'name', label: 'Your name', value: 'Ann' },
            { name: 'areas', label: 'Focus areas', value: ['Sleep', 'Food'] },
            { name: 'level', label: 'Intensity', value: 'High' },
            { name: 'note', label: 'Anything else?', value: 'Line one\nLine two' },
        ],
    };
    await conversation(page, [
        user('m-1', 'Hello'),
        agent('a-1', FORM),
        { type: 'user', id: 'm-2', createdAt: 3, text: buildGenerativeUiAnswerText(answer), answer },
    ]);

    // The form is gone, the agent's text stays.
    await expect(messages(page).getByText('Tell me about you')).toBeVisible();
    await expect(messages(page).getByRole('textbox')).toHaveCount(0);
    await expect(messages(page).getByRole('checkbox')).toHaveCount(0);
    await expect(messages(page).getByRole('combobox')).toBeHidden();
    await expect(messages(page).getByRole('button', { name: 'Make the plan' })).toBeHidden();
    await expect(messages(page).getByRole('button', { name: 'Just the basics' })).toBeHidden();

    await expect(messages(page).getByRole('term')).toHaveText([
        'Your name',
        'Focus areas',
        'Intensity',
        'Anything else?',
    ]);
    await expect(messages(page).getByRole('definition')).toHaveText(
        ['Ann', 'Sleep', 'Food', 'High', 'Line one\nLine two'],
        {
            useInnerText: true,
        },
    );
    // Nothing that was not shown: not the code, and not the label of the default button it was sent with.
    await expect(messages(page).getByText('generativeUiAnswer')).toBeHidden();
    await expect(messages(page).getByText('```')).toBeHidden();
    await expect(messages(page).getByText('Make the plan')).toBeHidden();
});

test('a message typed by the person, or answered in an old program, shows as before', async ({ page }) => {
    await conversation(page, [
        user('m-1', 'Hello'),
        agent('a-1', LEGACY_CHOICES),
        user('m-2', "Let's start with movement"),
    ]);

    await expect(messages(page).getByText("Let's start with movement")).toBeVisible();
    await expect(messages(page).getByRole('button', { name: 'Movement' })).toHaveAttribute('aria-pressed', 'true');
    await expect(messages(page).getByRole('button', { name: 'Sleep' })).not.toHaveAttribute('aria-pressed');
    await expect(messages(page).getByRole('button', { name: 'Movement' })).toBeDisabled();
});

test('a form the person passed over by typing stays visible and inactive', async ({ page }) => {
    await conversation(page, [user('m-1', 'Hello'), agent('a-1', FORM), user('m-2', 'Actually, something else')]);

    await expect(messages(page).getByText('Actually, something else')).toBeVisible();
    await expect(messages(page).getByRole('textbox', { name: 'Your name' })).toBeDisabled();
    await expect(messages(page).getByRole('button', { name: 'Make the plan' })).toBeDisabled();
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
        .toEqual({ conversationId: 'c-1', answer: choiceAnswer('Sleep'), queued: false });
    await expect(composer(page)).toHaveValue('Wait, one more thing');
});

test('when the run on a form answer fails, the composer stays empty and trying again sends the same answer', async ({
    page,
}) => {
    const daemon = await conversation(page, [user('m-1', 'Hello'), agent('a-1', FORM)]);

    await messages(page).getByRole('textbox', { name: 'Your name' }).fill('Ann');
    await messages(page).getByRole('checkbox', { name: 'Sleep' }).check();
    await messages(page).getByRole('combobox', { name: 'Intensity' }).selectOption('High');
    await messages(page).getByRole('checkbox', { name: 'Movement' }).check();
    await messages(page).getByRole('button', { name: 'Make the plan' }).click();
    await expect.poll(() => daemon.sent).toHaveLength(1);

    daemon.messages['c-1'] = [
        ...(daemon.messages['c-1'] ?? []),
        { type: 'runEnd', id: 'e-2', createdAt: 5, outcome: 'failed', error: { kind: 'other', message: 'Overloaded' } },
    ];
    daemon.setRunning('c-1', false);
    daemon.emit({
        type: 'runFinished',
        conversationId: 'c-1',
        outcome: 'failed',
        error: { kind: 'other', message: 'Overloaded' },
    });
    await expect(composer(page)).toHaveValue('');
    await messages(page).getByRole('button', { name: 'Try again' }).click();

    await expect.poll(() => daemon.sent).toHaveLength(2);
    expect(daemon.sent[1]).toEqual({ conversationId: 'c-1', answer: FILLED_ANSWER, queued: false });
    await expect(composer(page)).toHaveValue('');
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

function choiceAnswer(button: string): GenerativeUiAnswer {
    return { kind: 'generativeUiAnswer', source: 'choices', name: 'choices', button, defaultButton: true, fields: [] };
}

/** The person's bubble paragraph carrying `text`, not the agent's button of the same label. */
function bubbleText(page: Page, text: string) {
    return messages(page).getByRole('paragraph').filter({ hasText: text });
}
