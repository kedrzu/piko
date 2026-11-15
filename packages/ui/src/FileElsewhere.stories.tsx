import type { Meta, StoryObj } from '@storybook/vue3-vite';

import FileElsewhere from './FileElsewhere.vue';

const meta: Meta<typeof FileElsewhere> = { title: 'FileElsewhere', component: FileElsewhere, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof FileElsewhere>;

/** A document the app does not show: Open in default app. */
export const Openable: Story = { args: { name: 'budżet.xlsx', openable: true } };

/** Not a document (a script the agent wrote): never offered to open. */
export const NotOpenable: Story = { args: { name: 'backup.sh' } };

/** A text file over what the app reads. */
export const TooLarge: Story = { args: { name: 'dziennik.md', reason: 'tooLarge', openable: true } };
