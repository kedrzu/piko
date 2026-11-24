import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h } from 'vue';

import type { SchedulesLayoutSchedule } from './SchedulesLayout.vue';
import SchedulesLayout from './SchedulesLayout.vue';
import styles from './SchedulesLayout.stories.module.scss';

const meta: Meta<typeof SchedulesLayout> = {
    title: 'SchedulesLayout',
    component: SchedulesLayout,
    tags: ['autodocs'],
    parameters: { layout: 'fullscreen' },
    decorators: [inCard()],
};
export default meta;
type Story = StoryObj<typeof SchedulesLayout>;

const SCHEDULES: SchedulesLayoutSchedule[] = [
    {
        id: 's1',
        name: 'Sortuj moją pocztę',
        to: '/schedules/s1',
        projectName: 'Poczta',
        projectColor: 'green',
        when: 'Codziennie o 8:00',
        lastRun: 'running',
        lastRunAt: 'dziś 8:00',
        nextAt: 'jutro 8:00',
        paused: false,
    },
    {
        id: 's2',
        name: 'Sprawdzanie ofert na LinkedIn',
        to: '/schedules/s2',
        projectName: 'Szukanie pracy',
        projectColor: 'blue',
        when: 'W dni robocze o 7:00',
        lastRun: 'late',
        lastRunAt: 'pt 9:14',
        nextAt: 'pon 7:00',
        paused: false,
    },
    {
        id: 's3',
        name: 'Poranna rutyna',
        to: '/schedules/s3',
        projectName: 'Zdrowie i pielęgnacja',
        projectColor: 'pink',
        when: 'Codziennie o 7:00',
        lastRun: 'skipped',
        lastRunAt: 'dziś 7:00',
        nextAt: 'jutro 7:00',
        paused: false,
    },
    {
        id: 's4',
        name: 'Miesięczne sprawdzenie pensji',
        to: '/schedules/s4',
        projectName: 'Szukanie pracy',
        projectColor: 'blue',
        when: 'Co miesiąc 3. dnia o 8:00',
        lastRun: 'failed',
        lastRunAt: '3 lis',
        nextAt: '3 gru, 8:00',
        paused: false,
    },
    {
        id: 's5',
        name: 'Plan tygodnia',
        to: '/schedules/s5',
        projectName: 'Zdrowie i pielęgnacja',
        projectColor: 'pink',
        when: 'W niedziele o 18:00',
        lastRun: 'notRun',
        nextAt: 'jutro 18:00',
        paused: false,
    },
    {
        id: 's6',
        name: 'Faktury za remont',
        to: '/schedules/s6',
        projectName: 'Remont mieszkania',
        projectColor: 'teal',
        when: 'Co miesiąc 1. dnia o 9:00',
        lastRun: 'finished',
        lastRunAt: '1 paź, 9:00',
        nextAt: '1 gru, 9:00',
        paused: true,
    },
];

/** Screen 09: every schedule, and the notes on late and skipped runs. */
export const Table: Story = {
    args: { schedules: SCHEDULES },
};

/** Screen 79: none yet. */
export const Empty: Story = {
    args: { schedules: [] },
};

export const Loading: Story = {
    args: { loading: true },
};

export const LoadFailed: Story = {
    args: { loadError: 'Error: connect ECONNREFUSED 127.0.0.1:4387' },
};

function inCard(): Decorator {
    return story => {
        const Story = story();
        return defineComponent({
            setup: () => () => <div class={styles['card']}>{h(Story)}</div>,
        });
    };
}
