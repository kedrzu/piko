import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h, ref } from 'vue';

import type { ScheduleSettingsValue } from './ScheduleSettings.vue';
import ScheduleSettings from './ScheduleSettings.vue';
import styles from './ScheduleSettings.stories.module.scss';

const meta: Meta<typeof ScheduleSettings> = {
    title: 'ScheduleSettings',
    component: ScheduleSettings,
    tags: ['autodocs'],
    decorators: [inColumn()],
};
export default meta;
type Story = StoryObj<typeof ScheduleSettings>;

const PROMPT =
    'Przejrzyj nową pocztę w Gmailu. Oznacz każdą wiadomość moimi etykietami i zapytaj mnie, zanim utworzysz nową.\n\nJeśli przyjdzie faktura, dopisz ją do Faktury.xlsx.';

const SORT_MY_EMAIL = {
    name: 'Sortuj moją pocztę',
    prompt: PROMPT,
    when: 'Codziennie o 8:00',
    preset: { repeat: 'daily', time: '08:00' },
    projectName: 'Poczta',
    projectColor: 'green',
} as const;

/** Screen 10: how it runs, each part with Edit. */
export const View: Story = {
    args: SORT_MY_EMAIL,
};

/** Screen 75: the form, every day at a time. */
export const Editing: Story = {
    args: { ...SORT_MY_EMAIL, editing: true },
};

/** A weekly schedule: the day beside the time. */
export const EditingWeekly: Story = {
    args: {
        ...SORT_MY_EMAIL,
        when: 'W każdą niedzielę o 2:30',
        preset: { repeat: 'weekly', weekday: 'SU', time: '02:30' },
        editing: true,
    },
};

export const EditingMonthly: Story = {
    args: {
        ...SORT_MY_EMAIL,
        when: 'Co miesiąc 3. dnia o 8:00',
        preset: { repeat: 'monthly', monthDay: 3, time: '08:00' },
        editing: true,
    },
};

/** Screen 76: a rule the form cannot show stays read-only; the name and prompt can still change. */
export const CustomRule: Story = {
    args: { ...SORT_MY_EMAIL, when: 'Codziennie o 8:00 do 31 grudnia', preset: undefined, editing: true },
};

export const Saving: Story = {
    args: { ...SORT_MY_EMAIL, editing: true, saving: true },
};

/** Screen 77: the daemon refused the save; its reason under the form. */
export const SaveFailed: Story = {
    args: {
        ...EditingWeekly.args,
        error: 'Ta godzina nie istnieje: w niedzielę 28 marca zegary przesuwają się z 2:00 na 3:00. Wybierz inną godzinę.',
    },
};

/** The panel as a screen holds it: Edit opens the form, Cancel and Save close it. */
export const Interactive: Story = {
    render: args =>
        defineComponent({
            setup() {
                const editing = ref(false);
                return () => (
                    <ScheduleSettings
                        {...SORT_MY_EMAIL}
                        editing={editing.value}
                        onEdit={() => (editing.value = true)}
                        onCancel={() => (editing.value = false)}
                        onSave={(value: ScheduleSettingsValue) => {
                            args.onSave?.(value);
                            editing.value = false;
                        }}
                    />
                );
            },
        }),
};

function inColumn(): Decorator {
    return story => {
        const Story = story();
        return defineComponent({
            setup: () => () => <div class={styles['column']}>{h(Story)}</div>,
        });
    };
}
