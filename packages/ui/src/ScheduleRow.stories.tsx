import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h } from 'vue';

import ScheduleRow from './ScheduleRow.vue';
import styles from './ScheduleRow.stories.module.scss';
import ScheduleRowHeader from './ScheduleRowHeader.vue';

const meta: Meta<typeof ScheduleRow> = { title: 'ScheduleRow', component: ScheduleRow, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof ScheduleRow>;

/** A row as its table holds it: the screen gives the table its role and name. */
const inTable: Decorator = story => {
    const Story = story();
    return defineComponent({
        setup: () => () => (
            <div
                role="table"
                aria-label="Harmonogramy"
                class={styles['table']}
            >
                <ScheduleRowHeader />
                {h(Story)}
            </div>
        ),
    });
};

/** Pen `molecules/Schedule row`. */
export const Finished: Story = {
    args: {
        name: 'Sortuj moją pocztę',
        to: '/schedules/s1',
        projectName: 'Poczta',
        projectColor: 'green',
        when: 'Codziennie o 8:00',
        lastRun: 'finished',
        lastRunAt: 'dziś 8:00',
        nextAt: 'jutro 8:00',
    },
    decorators: [inTable],
};

/** Pen `molecules/Schedule row/Paused`. */
export const Paused: Story = {
    args: {
        name: 'Faktury za remont',
        to: '/schedules/s8',
        projectName: 'Remont mieszkania',
        projectColor: 'teal',
        when: 'Co miesiąc 1. dnia o 9:00',
        lastRun: 'finished',
        lastRunAt: '1 paź, 9:00',
        nextAt: '1 gru, 9:00',
        paused: true,
    },
    decorators: [inTable],
};

/** Screen 09: the table with a row per state of the last run. */
export const Table: Story = {
    render: () => (
        <div
            role="table"
            aria-label="Harmonogramy"
            class={styles['table']}
        >
            <ScheduleRowHeader />
            <ScheduleRow
                name="Sortuj moją pocztę"
                to="/schedules/s1"
                projectName="Poczta"
                projectColor="green"
                when="Codziennie o 8:00"
                lastRun="running"
                lastRunAt="dziś 8:00"
                nextAt="jutro 8:00"
            />
            <ScheduleRow
                name="Sprawdzanie ofert na LinkedIn"
                to="/schedules/s2"
                projectName="Szukanie pracy"
                projectColor="blue"
                when="W dni robocze o 7:00"
                lastRun="late"
                lastRunAt="pt 9:14"
                nextAt="pon 7:00"
            />
            <ScheduleRow
                name="Poranna rutyna"
                to="/schedules/s3"
                projectName="Zdrowie i pielęgnacja"
                projectColor="pink"
                when="Codziennie o 7:00"
                lastRun="skipped"
                lastRunAt="dziś 7:00"
                nextAt="jutro 7:00"
            />
            <ScheduleRow
                name="Cotygodniowe statystyki"
                to="/schedules/s4"
                projectName="Posty na Instagram"
                projectColor="amber"
                when="W poniedziałki o 9:00"
                lastRun="finished"
                lastRunAt="pon 16 lis, 9:00"
                nextAt="pon 23 lis, 9:00"
            />
            <ScheduleRow
                name="Miesięczne sprawdzenie pensji"
                to="/schedules/s5"
                projectName="Szukanie pracy"
                projectColor="blue"
                when="Co miesiąc 3. dnia o 8:00"
                lastRun="failed"
                lastRunAt="3 lis"
                nextAt="3 gru, 8:00"
            />
            <ScheduleRow
                name="Plan tygodnia"
                to="/schedules/s6"
                projectName="Zdrowie i pielęgnacja"
                projectColor="pink"
                when="W niedziele o 18:00"
                lastRun="notRun"
                nextAt="jutro 18:00"
            />
            <ScheduleRow
                name="Odpowiedzi z sal weselnych"
                to="/schedules/s7"
                projectName="Planowanie wesela"
                projectColor="violet"
                when="Codziennie wieczorem do 14 lis"
                lastRun="finished"
                lastRunAt="14 lis, 20:00"
            />
            <ScheduleRow
                name="Faktury za remont"
                to="/schedules/s8"
                projectName="Remont mieszkania"
                projectColor="teal"
                when="Co miesiąc 1. dnia o 9:00"
                lastRun="finished"
                lastRunAt="1 paź, 9:00"
                nextAt="1 gru, 9:00"
                paused
            />
        </div>
    ),
};
