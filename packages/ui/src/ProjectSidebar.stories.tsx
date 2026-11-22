import type { Meta, StoryObj } from '@storybook/vue3-vite';

import type { ProjectSidebarConversation, ProjectSidebarFile, ProjectSidebarItem } from './ProjectSidebar.vue';
import ProjectSidebar from './ProjectSidebar.vue';
import styles from './ProjectSidebar.stories.module.scss';

const meta: Meta<typeof ProjectSidebar> = { title: 'ProjectSidebar', component: ProjectSidebar, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof ProjectSidebar>;

const PROJECTS: ProjectSidebarItem[] = [
    { id: 'p1', name: 'Szukanie pracy', color: 'blue', to: '/projects/p1' },
    { id: 'p2', name: 'Zdrowie', color: 'pink', to: '/projects/p2' },
    { id: 'p3', name: 'Posty na Instagram', color: 'amber', to: '/projects/p3' },
];

const CONVERSATIONS: ProjectSidebarConversation[] = [
    { id: 'c1', title: 'Poranna rutyna na zimę', to: '/projects/p2/conversations/c1', running: true },
    { id: 'c2', title: 'Krem z filtrem — co wybrać', to: '/projects/p2/conversations/c2', running: false },
    { id: 'c3', title: 'Pytania do dermatologa', to: '/projects/p2/conversations/c3', running: false },
    { id: 'c4', title: 'Ile wody dziennie', to: '/projects/p2/conversations/c4', running: false },
];

const FILES: ProjectSidebarFile[] = [
    { path: 'badania', label: 'badania', kind: 'folder', depth: 0, expanded: true },
    {
        path: 'badania/wyniki-2026.csv',
        label: 'wyniki-2026.csv',
        kind: 'spreadsheet',
        depth: 1,
        to: '/projects/p2/files?path=badania/wyniki-2026.csv',
    },
    { path: 'dokumenty', label: 'dokumenty', kind: 'folder', depth: 0 },
    {
        path: 'Plan treningów.md',
        label: 'Plan treningów',
        kind: 'note',
        depth: 0,
        to: '/projects/p2/files?path=Plan%20trening%C3%B3w.md',
    },
    {
        path: 'zdjecie-skory.jpg',
        label: 'zdjecie-skory.jpg',
        kind: 'image',
        depth: 0,
        to: '/projects/p2/files?path=zdjecie-skory.jpg',
    },
    {
        path: 'skierowanie.pdf',
        label: 'skierowanie.pdf',
        kind: 'file',
        depth: 0,
        to: '/projects/p2/files?path=skierowanie.pdf',
    },
];

/** Screen 51's sidebar: no projects yet. */
export const Empty: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <ProjectSidebar
                memoryTo="/memory"
                projects={[]}
            />
        </div>
    ),
};

/** Screen 54's sidebar: three projects, one open. */
export const Projects: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <ProjectSidebar
                memoryTo="/memory"
                projects={PROJECTS}
                selectedId="p2"
            />
        </div>
    ),
};

/** Screen 56's sidebar: the open conversation running, so its project spins too. */
export const ConversationOpen: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <ProjectSidebar
                memoryTo="/memory"
                projects={PROJECTS}
                selectedId="p2"
                conversations={CONVERSATIONS}
                selectedConversationId="c1"
            />
        </div>
    ),
};

/** Screen 58's sidebar: New conversation open, another conversation still running. */
export const NewConversation: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <ProjectSidebar
                memoryTo="/memory"
                projects={PROJECTS}
                selectedId="p2"
                conversations={CONVERSATIONS}
            />
        </div>
    ),
};

/** Screen 63's sidebar: Memory open. */
export const MemoryOpen: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <ProjectSidebar
                memoryTo="/memory"
                memorySelected
                projects={PROJECTS}
            />
        </div>
    ),
};

const APP_SETUP: ProjectSidebarItem = {
    id: 'p0',
    name: 'App setup',
    color: 'slate',
    to: '/projects/p0',
    mark: 'pinned',
};

const ONBOARDING: ProjectSidebarConversation[] = [
    { id: 'c0', title: 'Poznajmy się', to: '/projects/p0/conversations/c0', running: false },
];

/** Screen 65's sidebar: day one, App setup pinned and open on its onboarding conversation. */
export const DayOne: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <ProjectSidebar
                memoryTo="/memory"
                projects={[APP_SETUP]}
                selectedId="p0"
                conversations={ONBOARDING}
                selectedConversationId="c0"
            />
        </div>
    ),
};

/** Screen 66's sidebar: the projects the agent has just created, marked new until opened. */
export const NewProjects: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <ProjectSidebar
                memoryTo="/memory"
                projects={[
                    APP_SETUP,
                    { id: 'p1', name: 'Szukanie pracy', color: 'blue', to: '/projects/p1', mark: 'new' },
                    { id: 'p3', name: 'Posty na Instagram', color: 'amber', to: '/projects/p3', mark: 'new' },
                ]}
                selectedId="p0"
                conversations={ONBOARDING}
                selectedConversationId="c0"
            />
        </div>
    ),
};

/** The open project's files under its conversations, a folder expanded. */
export const ProjectFiles: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <ProjectSidebar
                memoryTo="/memory"
                projects={PROJECTS}
                selectedId="p2"
                conversations={CONVERSATIONS}
                files={FILES}
            />
        </div>
    ),
};

/** A file open: its row is the selected one, New conversation is not. */
export const FileOpen: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <ProjectSidebar
                memoryTo="/memory"
                projects={PROJECTS}
                selectedId="p2"
                conversations={CONVERSATIONS}
                files={FILES}
                selectedFilePath="Plan treningów.md"
            />
        </div>
    ),
};

/** A project with no files yet. */
export const NoFiles: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <ProjectSidebar
                memoryTo="/memory"
                projects={PROJECTS}
                selectedId="p2"
                files={[]}
            />
        </div>
    ),
};

/** Screen 09's sidebar: Schedules open, with how many there are. */
export const SchedulesOpen: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <ProjectSidebar
                memoryTo="/memory"
                schedulesTo="/schedules"
                schedulesCount={5}
                schedulesSelected
                projects={PROJECTS}
            />
        </div>
    ),
};

const JOB_SEARCH: ProjectSidebarConversation[] = [
    {
        id: 'c1',
        title: 'Sprawdzanie ofert na LinkedIn',
        to: '/projects/p1/conversations/c1',
        running: false,
        scheduled: true,
    },
    { id: 'c2', title: 'List motywacyjny do Allegro', to: '/projects/p1/conversations/c2', running: false },
    { id: 'c3', title: 'Widełki płacowe w Warszawie', to: '/projects/p1/conversations/c3', running: false },
];

/** Screen 11's sidebar: the project's every conversation open, under its conversations; one a schedule started. */
export const AllConversationsOpen: Story = {
    render: () => (
        <div class={styles['backdrop']}>
            <ProjectSidebar
                memoryTo="/memory"
                schedulesTo="/schedules"
                schedulesCount={5}
                projects={PROJECTS}
                selectedId="p1"
                conversations={JOB_SEARCH}
                allConversationsTo="/projects/p1/history"
                allConversationsSelected
                files={[]}
            />
        </div>
    ),
};
