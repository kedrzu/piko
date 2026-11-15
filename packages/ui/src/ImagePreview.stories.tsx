import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { SUNRISE_IMAGE } from './FileLayout.fixtures.js';
import ImagePreview from './ImagePreview.vue';

const meta: Meta<typeof ImagePreview> = { title: 'ImagePreview', component: ImagePreview, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof ImagePreview>;

export const Loaded: Story = { args: { src: SUNRISE_IMAGE, alt: 'cover-draft-3.png' } };

/** Its address is still being found. */
export const Loading: Story = { args: { alt: 'cover-draft-3.png' } };
