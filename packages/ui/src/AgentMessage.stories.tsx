import type { Meta, StoryObj } from '@storybook/vue3-vite';

import {
    CHOICES_TEXT,
    PLAN_FORM_HALF_WRITTEN,
    PLAN_FORM_TEXT,
    TWO_UIS_TEXT,
    WINTER_ROUTINE_FINISHED,
    WINTER_ROUTINE_RUNNING,
    WINTER_ROUTINE_STEPS,
} from './AgentMessage.fixtures.js';
import AgentMessage from './AgentMessage.vue';

const meta: Meta<typeof AgentMessage> = { title: 'AgentMessage', component: AgentMessage, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof AgentMessage>;

/** Screen 56: text and steps as they come, the caret after the last word. */
export const Running: Story = {
    render: () => (
        <AgentMessage
            parts={WINTER_ROUTINE_RUNNING}
            running
        />
    ),
};

/** The agent has started, with nothing written yet. */
export const Starting: Story = {
    render: () => (
        <AgentMessage
            parts={[]}
            running
        />
    ),
};

/** Working on a step, between two pieces of text. */
export const RunningStep: Story = {
    render: () => (
        <AgentMessage
            parts={[
                ...WINTER_ROUTINE_STEPS.slice(0, 2),
                { type: 'step', id: 's3', kind: 'runCommand', status: 'running' },
            ]}
            running
        />
    ),
};

/** Screen 57: the steps collapsed above the formatted reply. */
export const Finished: Story = { render: () => <AgentMessage parts={WINTER_ROUTINE_FINISHED} /> };

/** A short answer, with no steps. */
export const NoSteps: Story = {
    render: () => <AgentMessage parts={[{ type: 'text', text: 'Jasne, zrobione. Coś jeszcze?' }]} />,
};

/** The block is written while the agent works: what is there shows as controls, never as code, and none can be used yet. */
export const RunningHalfWrittenUi: Story = {
    render: () => (
        <AgentMessage
            parts={[...WINTER_ROUTINE_STEPS.slice(0, 1), { type: 'text', text: PLAN_FORM_HALF_WRITTEN }]}
            running
            uiActive
        />
    ),
};

/** Text, the form, text again, in the agent's order, with the steps collapsed above; the latest reply's form takes answers. */
export const FinishedWithActiveUi: Story = {
    args: { parts: [...WINTER_ROUTINE_STEPS, { type: 'text', text: PLAN_FORM_TEXT }], uiActive: true },
};

/** An earlier reply's form: shown, its controls disabled. */
export const FinishedWithInactiveUi: Story = {
    render: () => <AgentMessage parts={[{ type: 'text', text: PLAN_FORM_TEXT }]} />,
};

/** Two UIs in one reply: only the last takes answers. */
export const TwoUis: Story = {
    args: { parts: [{ type: 'text', text: TWO_UIS_TEXT }], uiActive: true },
};

/** Answered by the person's next message: the choice that sent it keeps its check. */
export const AnsweredChoice: Story = {
    args: { parts: [{ type: 'text', text: CHOICES_TEXT }], answer: 'Zacznijmy od snu' },
};
