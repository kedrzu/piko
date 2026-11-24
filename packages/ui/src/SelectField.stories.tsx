import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, ref } from 'vue';

import SelectField from './SelectField.vue';

const meta: Meta<typeof SelectField> = { title: 'SelectField', component: SelectField, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof SelectField>;

const DAYS = ['Poniedziałek', 'Środa', 'Sobota'];

export const Empty: Story = {
    render: () =>
        defineComponent({
            setup() {
                const day = ref('');
                return () => (
                    <SelectField
                        v-model={day.value}
                        label="Od którego dnia zaczynamy?"
                        options={DAYS}
                    />
                );
            },
        }),
};

export const Chosen: Story = {
    render: () => (
        <SelectField
            label="Od którego dnia zaczynamy?"
            options={DAYS}
            modelValue="Środa"
            help="Plan zacznie się tego dnia rano."
            optional
        />
    ),
};

export const Invalid: Story = {
    render: () => (
        <SelectField
            label="Od którego dnia zaczynamy?"
            options={DAYS}
            modelValue=""
            required
            errors="Uzupełnij to pole"
        />
    ),
};

export const Disabled: Story = {
    render: () => (
        <SelectField
            label="Od którego dnia zaczynamy?"
            options={DAYS}
            modelValue="Sobota"
            disabled
        />
    ),
};

/** Options whose labels are not their values, always holding one: no "Choose…" prompt. */
export const LabelledOptions: Story = {
    render: () => (
        <SelectField
            label="Powtarzaj"
            options={[
                { value: 'daily', label: 'Codziennie' },
                { value: 'weekly', label: 'Co tydzień w' },
            ]}
            modelValue="weekly"
            noPrompt
        />
    ),
};
