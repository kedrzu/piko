import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { SHOPPING_TEXT } from './FileLayout.fixtures.js';
import TextPreview from './TextPreview.vue';

const meta: Meta<typeof TextPreview> = { title: 'TextPreview', component: TextPreview, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof TextPreview>;

export const Text: Story = { args: { text: SHOPPING_TEXT } };

export const Empty: Story = { args: { text: '' } };
