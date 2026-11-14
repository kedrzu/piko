import type { Meta, StoryObj } from '@storybook/vue3-vite';

import Checkbox from './Checkbox.vue';
import FieldFrame from './FieldFrame.vue';

const meta: Meta<typeof FieldFrame> = { title: 'FieldFrame', component: FieldFrame, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof FieldFrame>;

/** A required field: its label carries no mark, its control says it is required. */
export const WithHelp: Story = {
    render: () => (
        <FieldFrame
            label="Nazwa projektu"
            help="Tak będzie się nazywał folder projektu."
        >
            {{
                default: ({ controlId, describedBy }: { controlId: string; describedBy: string | undefined }) => (
                    <input
                        id={controlId}
                        aria-describedby={describedBy}
                        required
                    />
                ),
            }}
        </FieldFrame>
    ),
};

/** A group of checkboxes under a legend, its error in place of the help line. */
export const GroupInvalid: Story = {
    render: () => (
        <FieldFrame
            label="Czym mam się zająć?"
            error="Uzupełnij to pole"
            group
        >
            <Checkbox>Sen</Checkbox>
            <Checkbox>Ruch</Checkbox>
        </FieldFrame>
    ),
};

/** An optional field says so after its label. */
export const Optional: Story = {
    render: () => (
        <FieldFrame
            label="Coś jeszcze?"
            optional
        >
            {{
                default: ({ controlId }: { controlId: string }) => <textarea id={controlId} />,
            }}
        </FieldFrame>
    ),
};
