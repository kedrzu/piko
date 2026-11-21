import type { Meta, StoryObj } from '@storybook/vue3-vite';

import {
    CHOICES_TEXT,
    LEGACY_CHOICES_TEXT,
    PLAN_FORM_HALF_WRITTEN,
    PLAN_FORM_TEXT,
    TWO_UIS_TEXT,
    WINTER_ROUTINE_FINISHED,
    WINTER_ROUTINE_RUNNING,
    WINTER_ROUTINE_STEPS,
} from './AgentMessage.fixtures.js';
import type { AgentMessageFile } from './AgentMessage.vue';
import AgentMessage from './AgentMessage.vue';
import FileChip from './FileChip.vue';

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

/** Screen 57 with its file: a chip under the text for the file the reply wrote. */
export const FinishedWithFile: Story = {
    render: () => <AgentMessage parts={WINTER_ROUTINE_FINISHED}>{{ file: fileChip }}</AgentMessage>,
};

/** Screen 56 with its file: the chip says "writing…" while the step writing it runs. */
export const RunningWithFile: Story = {
    render: () => (
        <AgentMessage
            parts={WINTER_ROUTINE_RUNNING}
            running
        >
            {{ file: fileChip }}
        </AgentMessage>
    ),
};

/**
 * Several files: one chip each, in the order of their first step; a file written twice gets one chip, and a failed
 * step's file none.
 */
export const SeveralFiles: Story = {
    render: () => (
        <AgentMessage
            parts={[
                { type: 'step', id: 's1', kind: 'writeFile', target: 'notes/Plan.md', status: 'done' },
                { type: 'step', id: 's2', kind: 'readFile', target: 'notes/Ideas.md', status: 'done' },
                { type: 'step', id: 's3', kind: 'editFile', target: 'budget.csv', status: 'done' },
                { type: 'step', id: 's4', kind: 'editFile', target: 'notes/Plan.md', status: 'done' },
                { type: 'step', id: 's5', kind: 'writeFile', target: 'broken.md', status: 'failed' },
                { type: 'text', text: 'Gotowe: plan i budżet są zaktualizowane.' },
            ]}
        >
            {{ file: fileChip }}
        </AgentMessage>
    ),
};

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

/** Answered by a click: the choice keeps its check. */
export const AnsweredChoice: Story = {
    args: {
        parts: [{ type: 'text', text: CHOICES_TEXT }],
        answer: {
            kind: 'generativeUiAnswer',
            source: 'choices',
            name: 'choices',
            button: 'Sen',
            defaultButton: true,
            fields: [],
        },
    },
};

/** Screen 78: the form was answered, so it is gone; the agent's text around it stays. */
export const AnsweredForm: Story = {
    args: {
        parts: [{ type: 'text', text: PLAN_FORM_TEXT }],
        answer: {
            kind: 'generativeUiAnswer',
            source: 'form',
            name: 'plan',
            button: 'Ułóż plan',
            defaultButton: true,
            fields: [{ name: 'areas', label: 'Czym mam się zająć?', value: ['Sen'] }],
        },
    },
};

/** The form passed over: the person typed instead, so it stays, inactive. */
export const FormAnsweredByTyping: Story = {
    args: { parts: [{ type: 'text', text: PLAN_FORM_TEXT }], answer: 'Zróbmy to później' },
};

/** Choices from before buttons lost their action, answered then with a button's message: that button keeps its check. */
export const LegacyAnsweredChoice: Story = {
    args: { parts: [{ type: 'text', text: LEGACY_CHOICES_TEXT }], answer: 'Zacznijmy od snu' },
};

/** What the app renders in the `file` slot, with the path for a name. */
function fileChip(file: AgentMessageFile) {
    return (
        <FileChip
            title={file.path}
            kind={file.path.endsWith('.csv') ? 'spreadsheet' : 'note'}
            place="Zdrowie"
            writing={file.running}
            to={`/projects/p1/conversations/c1?file=${encodeURIComponent(file.path)}`}
        />
    );
}
