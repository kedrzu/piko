import type { Meta, StoryObj } from '@storybook/vue3-vite';

import FilterChip from './FilterChip.vue';
import styles from './FilterChip.stories.module.scss';

const meta: Meta<typeof FilterChip> = { title: 'FilterChip', component: FilterChip, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof FilterChip>;

/** Pen `molecules/Filter chip`: a link to the list filtered by it. */
export const Off: Story = {
    args: { label: 'Rozpoczęte przez ciebie', count: 9, link: '/projects/p1/history?origin=person' },
};

/** Pen `molecules/Filter chip/On`: the filter in force. */
export const On: Story = {
    args: { label: 'Wszystkie', count: 31, link: '/projects/p1/history', on: true },
};

/** A schedule's filter, with its calendar. */
export const Schedule: Story = {
    args: {
        label: 'Sprawdzanie ofert na LinkedIn',
        count: 20,
        schedule: true,
        link: '/projects/p1/history?schedule=s1',
    },
};

/** Screen 11's row of filters, the first one on. */
export const Row: Story = {
    render: () => (
        <div class={styles['row']}>
            <FilterChip
                label="Wszystkie"
                count={31}
                link="/projects/p1/history"
                on
            />
            <FilterChip
                label="Rozpoczęte przez ciebie"
                count={9}
                link="/projects/p1/history?origin=person"
            />
            <FilterChip
                label="Sprawdzanie ofert na LinkedIn"
                count={20}
                link="/projects/p1/history?schedule=s1"
                schedule
            />
            <FilterChip
                label="Miesięczne sprawdzenie pensji"
                count={2}
                link="/projects/p1/history?schedule=s2"
                schedule
            />
        </div>
    ),
};

/** Without a link: a toggle button, pressed when on. */
export const Toggle: Story = {
    args: { label: 'Rozpoczęte przez ciebie', count: 9, on: true },
};
