import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h } from 'vue';

import type { ProjectHistoryLayoutFilter, ProjectHistoryLayoutRow } from './ProjectHistoryLayout.vue';
import ProjectHistoryLayout from './ProjectHistoryLayout.vue';
import styles from './ProjectHistoryLayout.stories.module.scss';

const meta: Meta<typeof ProjectHistoryLayout> = {
    title: 'ProjectHistoryLayout',
    component: ProjectHistoryLayout,
    tags: ['autodocs'],
    parameters: { layout: 'fullscreen' },
    decorators: [inCard()],
};
export default meta;
type Story = StoryObj<typeof ProjectHistoryLayout>;

const FILTERS: ProjectHistoryLayoutFilter[] = [
    { id: 'all', label: 'Wszystkie', count: 31, to: '/projects/p1/history', on: true },
    { id: 'person', label: 'Rozpoczęte przez Ciebie', count: 9, to: '/projects/p1/history?by=person', on: false },
    {
        id: 's2',
        label: 'Sprawdzanie ofert na LinkedIn',
        count: 20,
        schedule: true,
        to: '/projects/p1/history?by=s2',
        on: false,
    },
    {
        id: 's4',
        label: 'Miesięczne sprawdzenie pensji',
        count: 2,
        schedule: true,
        to: '/projects/p1/history?by=s4',
        on: false,
    },
];

const ROWS: ProjectHistoryLayoutRow[] = [
    {
        id: 'c1',
        section: 'thisWeek',
        day: 'Dziś',
        time: '7:00',
        status: 'finished',
        title: '3 nowe oferty do przejrzenia',
        detail: 'Zakończone o 7:04',
        scheduleName: 'Sprawdzanie ofert na LinkedIn',
        to: '/projects/p1/conversations/c1',
    },
    {
        id: 'c2',
        section: 'thisWeek',
        day: 'Wczoraj',
        time: '16:20',
        status: 'person',
        title: 'List motywacyjny do Allegro',
        detail: 'Ty · 14 wiadomości',
        to: '/projects/p1/conversations/c2',
    },
    {
        id: 't3',
        section: 'thisWeek',
        day: 'ndz 9 lis',
        time: '—',
        status: 'skipped',
        title: 'Pominięte',
        statusInTitle: true,
        detail: 'Poprzednie uruchomienie wciąż na Ciebie czekało',
        scheduleName: 'Sprawdzanie ofert na LinkedIn',
    },
    {
        id: 'c4',
        section: 'thisWeek',
        day: 'sob 8 lis',
        time: '9:13',
        status: 'late',
        title: '1 nowa oferta',
        detail: 'Zaplanowane na 7:00 · rozpoczęte 9:13',
        scheduleName: 'Sprawdzanie ofert na LinkedIn',
        to: '/projects/p1/conversations/c4',
    },
    {
        id: 'c5',
        section: 'earlier',
        day: '3 lis',
        time: '8:00',
        status: 'finished',
        title: 'Pensje za październik',
        detail: 'Zakończone o 8:09',
        scheduleName: 'Miesięczne sprawdzenie pensji',
        to: '/projects/p1/conversations/c5',
    },
    {
        id: 'c6',
        section: 'earlier',
        day: '28 paź',
        time: '19:40',
        status: 'person',
        title: 'Przepisz moje CV pod role produktowe',
        detail: 'Ty · 32 wiadomości',
        to: '/projects/p1/conversations/c6',
    },
];

/** Screen 11: every conversation, this week's and the earlier ones. */
export const All: Story = {
    args: { projectName: 'Szukanie pracy', newConversationTo: '/projects/p1', filters: FILTERS, rows: ROWS },
};

/** A filter that leaves nothing. */
export const EmptyFilter: Story = {
    args: {
        ...All.args,
        filters: FILTERS.map(filter => ({ ...filter, on: filter.id === 's4' })),
        rows: [],
    },
};

export const Loading: Story = {
    args: { ...All.args, rows: [], loading: true },
};

function inCard(): Decorator {
    return story => {
        const Story = story();
        return defineComponent({
            setup: () => () => <div class={styles['card']}>{h(Story)}</div>,
        });
    };
}
