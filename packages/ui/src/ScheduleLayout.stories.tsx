import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h } from 'vue';

import type { ScheduleLayoutRun } from './ScheduleLayout.vue';
import ScheduleLayout from './ScheduleLayout.vue';
import styles from './ScheduleLayout.stories.module.scss';

const meta: Meta<typeof ScheduleLayout> = {
    title: 'ScheduleLayout',
    component: ScheduleLayout,
    tags: ['autodocs'],
    parameters: { layout: 'fullscreen' },
    decorators: [inCard()],
};
export default meta;
type Story = StoryObj<typeof ScheduleLayout>;

const RUNS: ScheduleLayoutRun[] = [
    {
        id: 'r1',
        day: 'Dziś',
        time: '8:00',
        status: 'running',
        title: 'Sortuj moją pocztę',
        detail: 'Wciąż działa',
        to: '/projects/p5/conversations/c1',
    },
    {
        id: 'r2',
        day: 'pt 20 lis',
        time: '9:14',
        status: 'late',
        title: 'Dwie faktury do zapisania',
        detail: 'Zaplanowane na 8:00 · rozpoczęte 9:14, komputer był uśpiony albo piko było zamknięte',
        to: '/projects/p5/conversations/c2',
    },
    {
        id: 'r3',
        day: 'czw 19 lis',
        time: '8:00',
        status: 'skipped',
        title: 'Pominięte',
        statusInTitle: true,
        detail: 'Poprzednie uruchomienie wciąż na Ciebie czekało',
    },
    {
        id: 'r4',
        day: 'śr 18 lis',
        time: '8:00',
        status: 'finished',
        title: 'Pytanie o etykiety z Allegro',
        detail: 'Zakończone o 8:06',
        to: '/projects/p5/conversations/c4',
    },
    {
        id: 'r5',
        day: 'wt 17 lis',
        time: '8:00',
        status: 'failed',
        title: 'Nie udało się uruchomić',
        statusInTitle: true,
        detail: 'Wykorzystano limit Claude. Odnowi się o 13:00.',
    },
    {
        id: 'r6',
        day: 'pon 16 lis',
        time: '8:01',
        status: 'finished',
        title: 'Sortuj moją pocztę',
        detail: 'Zakończone o 8:03',
        to: '/projects/p5/conversations/c6',
    },
];

const SORT_MY_EMAIL = {
    name: 'Sortuj moją pocztę',
    schedulesTo: '/schedules',
    projectName: 'Poczta',
    projectColor: 'green',
    projectTo: '/projects/p5',
    runs: RUNS,
    prompt: 'Przejrzyj nową pocztę w Gmailu. Oznacz każdą wiadomość moimi etykietami i zapytaj mnie, zanim utworzysz nową.\n\nJeśli przyjdzie faktura, dopisz ją do Faktury.xlsx.',
    when: 'Codziennie o 8:00',
    preset: { repeat: 'daily', time: '08:00' },
} as const;

/** Screen 10: its runs beside how it runs. */
export const Runs: Story = {
    args: SORT_MY_EMAIL,
};

/** A new schedule: no runs yet, and when the first one comes. */
export const NoRuns: Story = {
    args: { ...SORT_MY_EMAIL, runs: [], nextAt: 'jutro 8:00' },
};

/** The runs are still being read. */
export const RunsLoading: Story = {
    args: { ...SORT_MY_EMAIL, runs: [], runsLoading: true },
};

export const Paused: Story = {
    args: { ...SORT_MY_EMAIL, paused: true },
};

/** Screen 75: how it runs as a form. */
export const Editing: Story = {
    args: { ...SORT_MY_EMAIL, editing: true },
};

/** Screen 76: a rule the form cannot show. */
export const CustomRule: Story = {
    args: { ...SORT_MY_EMAIL, when: 'Codziennie o 8:00 do 31 grudnia', preset: undefined, editing: true },
};

/** Screen 77: the save failed. */
export const SaveFailed: Story = {
    args: {
        ...SORT_MY_EMAIL,
        when: 'W każdą niedzielę o 2:30',
        preset: { repeat: 'weekly', weekday: 'SU', time: '02:30' },
        editing: true,
        saveError:
            'Ta godzina nie istnieje: w niedzielę 28 marca zegary przesuwają się z 2:00 na 3:00. Wybierz inną godzinę.',
    },
};

/** Screen 78: Delete asks first. */
export const DeleteOpen: Story = {
    args: { ...SORT_MY_EMAIL, deleteOpen: true },
};

/** Screen 80: the agent removed the schedule while the screen was open. */
export const Gone: Story = {
    args: { ...SORT_MY_EMAIL, gone: true },
};

function inCard(): Decorator {
    return story => {
        const Story = story();
        return defineComponent({
            setup: () => () => <div class={styles['card']}>{h(Story)}</div>,
        });
    };
}
