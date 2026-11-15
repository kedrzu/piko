import type { Meta, StoryObj } from '@storybook/vue3-vite';

import CsvPreview, { CSV_PREVIEW_MAX_ROWS } from './CsvPreview.vue';
import { STEPS_CSV } from './FileLayout.fixtures.js';

const meta: Meta<typeof CsvPreview> = { title: 'CsvPreview', component: CsvPreview, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof CsvPreview>;

/** Quoted fields with commas and quotes, and an empty last field. */
export const Table: Story = { args: { text: STEPS_CSV } };

/** More rows than are shown: the first ones, and a line saying so. */
export const Long: Story = {
    args: {
        text: ['day,steps', ...Array.from({ length: CSV_PREVIEW_MAX_ROWS + 5 }, (_, i) => `${i + 1},${5000 + i}`)].join(
            '\n',
        ),
    },
};

/** Rows shorter than the header, padded with empty cells. */
export const Ragged: Story = { args: { text: 'a,b,c\n1\n1,2\n' } };

export const Empty: Story = { args: { text: '' } };
