import type { Meta, StoryObj } from '@storybook/vue3-vite';

import Toaster from './Toaster.vue';
import UpdateToast from './UpdateToast.vue';

const meta: Meta<typeof UpdateToast> = {
    title: 'UpdateToast',
    component: UpdateToast,
    tags: ['autodocs'],
    args: { currentVersion: '0.1.0-dev.214' },
    parameters: {
        a11y: {
            context: {
                // The focus guards around reka-ui's toast viewport, as in `Toast.stories.tsx`.
                exclude: ['[role="region"] > span[aria-hidden="true"][tabindex="0"]'],
            },
        },
    },
    render: args => (
        <Toaster>
            <UpdateToast {...args} />
        </Toaster>
    ),
};
export default meta;
type Story = StoryObj<typeof UpdateToast>;

/** `molecules/Update toast/Ready`: the update is downloaded; Restart is the only way to it. */
export const Ready: Story = {
    args: { offer: { kind: 'ready', version: '0.1.0-dev.215' } },
};

/** `molecules/Update toast/Restarting`: Restart busy, the × disabled. */
export const Installing: Story = {
    args: { offer: { kind: 'installing', version: '0.1.0-dev.215' } },
};

/** `molecules/Update toast/Install failed`: the install did not go through; Try again. */
export const InstallFailed: Story = {
    args: { offer: { kind: 'installFailed', version: '0.1.0-dev.215' } },
};
