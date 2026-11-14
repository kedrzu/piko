import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, ref } from 'vue';

import CheckboxGroup from './CheckboxGroup.vue';

const meta: Meta<typeof CheckboxGroup> = { title: 'CheckboxGroup', component: CheckboxGroup, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof CheckboxGroup>;

const AREAS = ['Sen', 'Jedzenie', 'Ruch', 'Odpoczynek od ekranu'];

export const Empty: Story = {
    render: () =>
        defineComponent({
            setup() {
                const areas = ref<readonly string[]>([]);
                return () => (
                    <CheckboxGroup
                        v-model={areas.value}
                        label="Czym mam się zająć?"
                        options={AREAS}
                    />
                );
            },
        }),
};

export const Chosen: Story = {
    render: () => (
        <CheckboxGroup
            label="Czym mam się zająć?"
            options={AREAS}
            modelValue={['Sen', 'Ruch']}
            help="Możesz wybrać kilka."
        />
    ),
};

export const Invalid: Story = {
    render: () => (
        <CheckboxGroup
            label="Czym mam się zająć?"
            options={AREAS}
            modelValue={[]}
            required
            errors="Uzupełnij to pole"
        />
    ),
};

export const Disabled: Story = {
    render: () => (
        <CheckboxGroup
            label="Czym mam się zająć?"
            options={AREAS}
            modelValue={['Jedzenie']}
            disabled
        />
    ),
};
