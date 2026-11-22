import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h } from 'vue';

import HistoryRow from './HistoryRow.vue';
import styles from './HistoryRow.stories.module.scss';

const meta: Meta<typeof HistoryRow> = { title: 'HistoryRow', component: HistoryRow, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof HistoryRow>;

/** A row in its list. */
const inList: Decorator = story => {
    const Story = story();
    return defineComponent({
        setup: () => () => <div class={styles['list']}>{h(Story)}</div>,
    });
};

/** Pen `molecules/History row`: a conversation the person started. */
export const Person: Story = {
    args: {
        day: 'Dziś',
        time: '7:42',
        status: 'person',
        title: 'List motywacyjny do Allegro',
        detail: 'Ty · 14 wiadomości',
        to: '/projects/p1/conversations/c1',
    },
    decorators: [inList],
};

/** A finished run on a project's history (screen 11), with the schedule that started it. */
export const ScheduledRun: Story = {
    args: {
        day: 'Dziś',
        time: '7:00',
        status: 'finished',
        title: '3 nowe oferty do przejrzenia',
        detail: 'Zakończone o 7:04',
        scheduleName: 'Sprawdzanie ofert na LinkedIn',
        to: '/projects/p1/conversations/c2',
    },
    decorators: [inList],
};

export const Running: Story = {
    args: {
        day: 'Dziś',
        time: '8:00',
        status: 'running',
        title: 'Sortuj moją pocztę',
        detail: 'Wciąż działa',
        to: '/projects/p2/conversations/c3',
    },
    decorators: [inList],
};

/** A run whose conversation is not at hand (not loaded yet, or gone): only that it started. */
export const Started: Story = {
    args: {
        day: 'Dziś',
        time: '8:00',
        status: 'started',
        title: 'Sortuj moją pocztę',
        detail: 'Uruchomione o 8:00',
        to: '/projects/p2/conversations/c3',
    },
    decorators: [inList],
};

export const Late: Story = {
    args: {
        day: 'pt 20 lis',
        time: '9:14',
        status: 'late',
        title: 'Dwie faktury do zapisania',
        detail: 'Na 8:00 · ruszyło o 9:14, komputer spał albo piko było zamknięte',
        to: '/projects/p2/conversations/c4',
    },
    decorators: [inList],
};

/** A skipped term has no conversation: no link, no chevron. */
export const Skipped: Story = {
    args: {
        day: 'czw 19 lis',
        time: '8:00',
        status: 'skipped',
        title: 'Pominięte',
        statusInTitle: true,
        detail: 'Poprzednie uruchomienie wciąż na ciebie czekało',
    },
    decorators: [inList],
};

/** A term that couldn't start, without a conversation. */
export const Failed: Story = {
    args: {
        day: 'wt 17 lis',
        time: '8:00',
        status: 'failed',
        title: 'Nie udało się uruchomić',
        statusInTitle: true,
        detail: 'Wykorzystano limit Claude. Odnowi się o 13:00.',
    },
    decorators: [inList],
};

/** A term that failed after its conversation began: a link to it. */
export const FailedWithConversation: Story = {
    args: {
        day: 'wt 17 lis',
        time: '8:00',
        status: 'failed',
        title: 'Sortuj moją pocztę',
        detail: 'Nie udało się dokończyć',
        to: '/projects/p2/conversations/c5',
    },
    decorators: [inList],
};

/** Screen 11: a project's conversations, the person's and its schedules', with their chips. */
export const ProjectHistory: Story = {
    render: () => (
        <div class={styles['list']}>
            <HistoryRow
                day="Dziś"
                time="7:00"
                status="finished"
                title="3 nowe oferty do przejrzenia"
                detail="Zakończone o 7:04"
                scheduleName="Sprawdzanie ofert na LinkedIn"
                to="/projects/p1/conversations/c1"
            />
            <HistoryRow
                day="Wczoraj"
                time="16:20"
                status="person"
                title="List motywacyjny do Allegro"
                detail="Ty · 14 wiadomości"
                to="/projects/p1/conversations/c2"
            />
            <HistoryRow
                day="nd 9 lis"
                time="—"
                status="skipped"
                title="Pominięte"
                statusInTitle
                detail="Poprzednie uruchomienie wciąż na ciebie czekało"
                scheduleName="Sprawdzanie ofert na LinkedIn"
            />
            <HistoryRow
                day="sob 8 lis"
                time="9:13"
                status="late"
                title="1 nowa oferta"
                detail="Na 7:00 · ruszyło o 9:13"
                scheduleName="Sprawdzanie ofert na LinkedIn"
                to="/projects/p1/conversations/c3"
            />
            <HistoryRow
                day="3 lis"
                time="8:00"
                status="failed"
                title="Nie udało się uruchomić"
                statusInTitle
                detail="Wykorzystano limit Claude. Odnowi się o 13:00."
                scheduleName="Miesięczne sprawdzenie pensji"
            />
        </div>
    ),
};
