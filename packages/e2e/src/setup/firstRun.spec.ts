import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { ACCOUNT_EMAIL, FREE_PLAN_CODE, GOOD_CODE, StubDaemon } from '../StubDaemon.js';

test('home shows only once the sandbox is ready and Claude connected', async ({ page }) => {
    const daemon = await StubDaemon.install(page);
    daemon.sandbox = { status: 'startingVm' };

    await test.step('sandbox starting: the environment screen, whatever the link', async () => {
        await page.goto('/');
        await expect(heading(page)).toHaveText("Preparing the agent's workplace");
        await expect(page.getByRole('progressbar', { name: "Starting the agent's computer…" })).toBeVisible();

        await page.goto('/setup/done');
        await expect(heading(page)).toHaveText("Preparing the agent's workplace");
        await expect(page).toHaveURL(/\/setup\/environment$/);
    });

    await test.step('sandbox ready, Claude not connected: the provider choice', async () => {
        daemon.sandbox = { status: 'ready' };
        await expect(heading(page)).toHaveText('Connect your AI account');

        await page.goto('/');
        await expect(heading(page)).toHaveText('Connect your AI account');
    });

    await test.step('Claude on a plan the agent cannot use: the plan screen', async () => {
        daemon.claude = { connected: true, email: ACCOUNT_EMAIL, plan: 'free', planAllowed: false };
        await page.goto('/');
        await expect(heading(page)).toHaveText('This account has neither the Pro nor the Max plan');
    });

    await test.step('connected: home', async () => {
        daemon.claude = { connected: true, email: ACCOUNT_EMAIL, plan: 'max', planAllowed: true };
        await page.goto('/');
        await expect(heading(page)).toHaveText('Start with your first project');
    });

    await test.step('the sandbox stops being ready: back to the environment screen', async () => {
        daemon.sandbox = { status: 'startingAgent' };
        await expect(heading(page)).toHaveText("Preparing the agent's workplace");
        await expect(page.getByRole('progressbar', { name: 'Starting the agent…' })).toBeVisible();
    });
});

test('the environment screen shows how far the start is and the time left', async ({ page }) => {
    const daemon = await StubDaemon.install(page);
    daemon.sandbox = { status: 'startingVm', progress: { fraction: 0.42, remainingMs: 150_000 } };
    await page.goto('/');

    const bar = page.getByRole('progressbar', { name: "Starting the agent's computer…" });
    await expect(bar).toHaveAttribute('aria-valuenow', '42');
    await expect(page.getByText('About 3 min left')).toBeVisible();

    daemon.sandbox = { status: 'buildingImage', progress: { fraction: 0.9, remainingMs: 0 } };
    await expect(page.getByText('Just a moment…')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Preparing the tools…' })).toHaveAttribute(
        'aria-valuenow',
        '90',
    );
});

test('a failed start shows its details and retries', async ({ page }) => {
    const daemon = await StubDaemon.install(page);
    daemon.sandbox = { status: 'failed', message: 'vz: not enough free memory' };

    await page.goto('/');
    await expect(heading(page)).toHaveText("Couldn't prepare the agent's workplace");
    const details = page.getByText('vz: not enough free memory');
    await expect(details).toBeHidden();
    await page.getByRole('button', { name: 'Show details' }).click();
    await expect(details).toBeVisible();

    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(heading(page)).toHaveText("Preparing the agent's workplace");
    expect(daemon.countCalls('sandbox/start')).toBe(1);
});

test("a failed check of Claude's status shows its details and retries", async ({ page }) => {
    const daemon = await StubDaemon.install(page);
    daemon.aiStatusError = 'OpenCode has no claude-agent integration';

    await page.goto('/');
    await expect(heading(page)).toHaveText("Couldn't check the connection to your AI");
    await page.getByRole('button', { name: 'Show details' }).click();
    await expect(page.getByText('OpenCode has no claude-agent integration')).toBeVisible();

    daemon.aiStatusError = 'claude auth status printed no JSON';
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('claude auth status printed no JSON')).toBeVisible();

    daemon.aiStatusError = null;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(heading(page)).toHaveText('Connect your AI account');
});

test('connecting Claude: a rejected code, the sign-in page again, connected', async ({ page }) => {
    const daemon = await StubDaemon.install(page);
    await page.goto('/');

    await test.step('the Claude card opens the sign-in page', async () => {
        const signIn = page.waitForEvent('popup');
        await page.getByRole('button', { name: 'Connect Claude' }).click();
        expect((await signIn).url()).toBe('https://claude.ai/oauth/authorize?attempt=1');
        await expect(heading(page)).toHaveText('Finish signing in to Claude');
    });

    await test.step('opening it again reuses the waiting sign-in', async () => {
        const signIn = page.waitForEvent('popup');
        await openSignInAgain(page);
        expect((await signIn).url()).toBe('https://claude.ai/oauth/authorize?attempt=1');
        expect(daemon.countCalls('claude/login/start')).toBe(1);
    });

    await test.step('a rejected code: opening again opens the sign-in the daemon started instead', async () => {
        await codeField(page).fill('wrong-code#state');
        await page.getByRole('button', { name: 'Connect', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText("This code didn't work.");

        const signIn = page.waitForEvent('popup');
        await openSignInAgain(page);
        expect((await signIn).url()).toBe('https://claude.ai/oauth/authorize?attempt=2');
        expect(daemon.countCalls('claude/login/start')).toBe(1);
    });

    await test.step('a good code: connected, then home', async () => {
        await codeField(page).fill(GOOD_CODE);
        await page.getByRole('button', { name: 'Connect', exact: true }).click();
        await expect(heading(page)).toHaveText('All set, Claude is connected');
        await expect(page.getByText(ACCOUNT_EMAIL)).toBeVisible();

        await page.getByRole('button', { name: 'Go to the app' }).click();
        await expect(heading(page)).toHaveText('Start with your first project');
    });
});

test('a plan the agent cannot use offers another account', async ({ page }) => {
    const daemon = await StubDaemon.install(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Connect Claude' }).click();
    await codeField(page).fill(FREE_PLAN_CODE);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();

    await expect(heading(page)).toHaveText('This account has neither the Pro nor the Max plan');
    await expect(page.getByText(ACCOUNT_EMAIL)).toBeVisible();

    daemon.loginStartFails = true;
    await page.getByRole('button', { name: 'Sign in with another account' }).click();
    await expect(page.getByRole('alert')).toHaveText("Couldn't open Claude's sign-in. Try again.");

    daemon.loginStartFails = false;
    const signIn = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Sign in with another account' }).click();
    expect((await signIn).url()).toBe('https://claude.ai/oauth/authorize?attempt=2');
    await expect(heading(page)).toHaveText('Finish signing in to Claude');
    expect(daemon.countCalls('claude/login/start')).toBe(3);
});

test('connecting ChatGPT: the sign-in page again, then connected on its own', async ({ page }) => {
    const daemon = await StubDaemon.install(page);
    await page.goto('/');

    await test.step("the ChatGPT card opens OpenAI's sign-in page and waits", async () => {
        const signIn = page.waitForEvent('popup');
        await chatgptCard(page).click();
        expect((await signIn).url()).toBe(chatgptSignInUrl(1));
        await expect(heading(page)).toHaveText('Finish signing in to ChatGPT');
        await expect(waiting(page)).toBeVisible();
    });

    await test.step('opening it again reuses the waiting sign-in', async () => {
        const signIn = page.waitForEvent('popup');
        await openSignInAgain(page);
        expect((await signIn).url()).toBe(chatgptSignInUrl(1));
        expect(daemon.countCalls('chatgpt/login/start')).toBe(1);
    });

    await test.step('signed in on the page: connected by itself, then home', async () => {
        daemon.endChatgptLogin('connected');
        await expect(heading(page)).toHaveText('All set, ChatGPT is connected');

        await page.getByRole('button', { name: 'Go to the app' }).click();
        await expect(heading(page)).toHaveText('Start with your first project');
    });
});

test('a ChatGPT sign-in that failed or expired starts again, and Back ends it', async ({ page }) => {
    const daemon = await StubDaemon.install(page);
    await page.goto('/');
    await chatgptCard(page).click();
    await expect(waiting(page)).toBeVisible();

    await test.step('refused: trying again opens a new sign-in', async () => {
        daemon.endChatgptLogin('failed');
        await expect(page.getByRole('alert')).toContainText("ChatGPT didn't confirm the sign-in");

        const signIn = page.waitForEvent('popup');
        await page.getByRole('button', { name: 'Try again' }).click();
        expect((await signIn).url()).toBe(chatgptSignInUrl(2));
        await expect(waiting(page)).toBeVisible();
    });

    await test.step('expired: starting over opens a new sign-in', async () => {
        daemon.endChatgptLogin('expired');
        await expect(page.getByRole('alert')).toContainText('The sign-in has expired');

        const signIn = page.waitForEvent('popup');
        await page.getByRole('button', { name: 'Start over' }).click();
        expect((await signIn).url()).toBe(chatgptSignInUrl(3));
        await expect(waiting(page)).toBeVisible();
    });

    await test.step('Back ends the waiting sign-in and returns to the provider choice', async () => {
        await page.getByRole('button', { name: 'Back' }).click();
        await expect(heading(page)).toHaveText('Connect your AI account');
        expect(daemon.countCalls('chatgpt/login/cancel')).toBe(1);
    });

    await test.step('a sign-in that cannot start says so on the provider choice', async () => {
        daemon.chatgptLoginStartFails = true;
        await chatgptCard(page).click();
        await expect(page.getByRole('alert')).toHaveText("Couldn't open ChatGPT's sign-in. Try again.");
        await expect(heading(page)).toHaveText('Connect your AI account');
    });
});

test("with ChatGPT active, signing in again stays open, and a Claude account on a free plan shows Claude's plan screen", async ({
    page,
}) => {
    const daemon = await StubDaemon.install(page);
    daemon.chatgpt = { connected: true };
    daemon.activeProvider = 'chatgpt';
    await page.goto('/');
    await expect(heading(page)).toHaveText('Start with your first project');

    await test.step('the ChatGPT sign-in screen', async () => {
        await page.goto('/setup/ai');
        await chatgptCard(page).click();
        await expect(heading(page)).toHaveText('Finish signing in to ChatGPT');
        await expect(page).toHaveURL(/\/setup\/ai\/chatgpt$/);
        await page.getByRole('button', { name: 'Back' }).click();
    });

    await test.step("a Claude sign-in on a free plan: Claude's plan screen", async () => {
        await page.getByRole('button', { name: 'Connect Claude' }).click();
        await codeField(page).fill(FREE_PLAN_CODE);
        await page.getByRole('button', { name: 'Connect', exact: true }).click();
        await expect(heading(page)).toHaveText('This account has neither the Pro nor the Max plan');
        await expect(page.getByText(ACCOUNT_EMAIL)).toBeVisible();
    });
});

function heading(page: Page) {
    return page.getByRole('heading', { level: 1 });
}

function codeField(page: Page) {
    return page.getByRole('textbox', { name: 'Code from Claude' });
}

async function openSignInAgain(page: Page) {
    await page.getByRole('button', { name: 'Open the sign-in page again' }).click();
}

function chatgptCard(page: Page) {
    return page.getByRole('button', { name: 'Connect ChatGPT' });
}

function waiting(page: Page) {
    return page.getByRole('status').filter({ hasText: 'Waiting for you to sign in…' });
}

/** The page of the `attempt`-th ChatGPT sign-in `StubDaemon` started, counting from 1. */
function chatgptSignInUrl(attempt: number) {
    return `https://auth.openai.com/api/accounts/authorize?attempt=${attempt}`;
}
