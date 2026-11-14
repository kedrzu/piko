import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, ref } from 'vue';

import Checkbox from './Checkbox.vue';

const meta: Meta<typeof Checkbox> = { title: 'Checkbox', component: Checkbox, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Unchecked: Story = {
    render: () =>
        defineComponent({
            setup() {
                const checked = ref(false);
                return () => <Checkbox v-model={checked.value}>Przypominaj mi o przerwach</Checkbox>;
            },
        }),
};

export const Checked: Story = {
    render: () => <Checkbox modelValue>Przypominaj mi o przerwach</Checkbox>,
};

export const Disabled: Story = {
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Checkbox disabled>Przypominaj mi o przerwach</Checkbox>
            <Checkbox
                modelValue
                disabled
            >
                Wysyłaj podsumowanie tygodnia
            </Checkbox>
        </div>
    ),
};
