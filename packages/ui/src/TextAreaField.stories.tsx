import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, ref } from 'vue';

import TextAreaField from './TextAreaField.vue';

const meta: Meta<typeof TextAreaField> = { title: 'TextAreaField', component: TextAreaField, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof TextAreaField>;

export const Empty: Story = {
    render: () =>
        defineComponent({
            setup() {
                const note = ref('');
                return () => (
                    <TextAreaField
                        v-model={note.value}
                        label="Coś jeszcze?"
                        placeholder="Napisz, co jest dla Ciebie ważne"
                    />
                );
            },
        }),
};

export const Filled: Story = {
    render: () => (
        <TextAreaField
            label="Coś jeszcze?"
            help="Pole rośnie razem z tekstem."
            modelValue={'Wstaję o 6, pracuję zdalnie.\nWieczorem mam mało czasu.\nNie lubię biegać.'}
        />
    ),
};

export const Invalid: Story = {
    render: () => (
        <TextAreaField
            label="Opisz problem"
            modelValue=""
            required
            errors="Uzupełnij to pole"
        />
    ),
};

export const Disabled: Story = {
    render: () => (
        <TextAreaField
            label="Coś jeszcze?"
            modelValue="Wstaję o 6."
            disabled
        />
    ),
};
