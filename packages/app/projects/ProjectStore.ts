import { Translator } from '@nzyme/i18n/Translator.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { createSingleRunner } from '@nzyme/utils/createSingleRunner.js';
import { computed, reactive, ref } from 'vue';

import { AppSetupStartEndpoint } from '@piko/common/api/AppSetupStartEndpoint.js';
import type { ConversationRef } from '@piko/common/api/ConversationTypes.js';
import { ProjectCreateEndpoint } from '@piko/common/api/ProjectCreateEndpoint.js';
import { ProjectListEndpoint } from '@piko/common/api/ProjectListEndpoint.js';
import type { DaemonEvent } from '@piko/common/api/DaemonEventTypes.js';
import type { Project, ProjectCreateResult } from '@piko/common/api/ProjectTypes.js';
import { compareProjectsByName } from '@piko/common/utils/compareProjectsByName.js';

import { DaemonClient } from '@/daemon/DaemonClient.js';
import { DaemonEventStream } from '@/daemon/DaemonEventStream.js';
import { LanguageStore } from '@/i18n/LanguageStore.js';
import { parseStoredIds } from '@/utils/parseStoredIds.js';

import * as l from './ProjectStore.loc.js';

/** Where the last opened project's id is kept, so the app reopens it after a restart. */
const LAST_OPENED_KEY = 'piko.lastOpenedProjectId';
/** Where the ids of the projects ever opened are kept: any other project is marked new (design 66). */
const OPENED_KEY = 'piko.openedProjectIds';

/**
 * The person's projects as the daemon lists them, loaded once and kept in step with the projects the app creates and
 * with the daemon's events (a project folder made or removed outside the app, the agent creating one); the project
 * opened last and the projects ever opened, remembered across restarts. The first load also asks the daemon for App
 * setup, which it creates once per profile with its onboarding conversation started, without waiting for it: the
 * projects are listed again when the onboarding has just started.
 */
export const ProjectStore = defineService({
    name: 'ProjectStore',
    deps: {
        daemon: DaemonClient,
        events: DaemonEventStream,
        language: LanguageStore,
        translator: Translator,
        logger: Logger,
    },
    setup({ daemon, events, language, translator, logger }) {
        /** `null` until loaded. */
        const projects = ref<Project[] | null>(null);
        const loadError = ref<string | null>(null);
        const loader = createSingleRunner({ handler: load });
        /** Counts loads, so the answer of a load started before a newer one never replaces the newer list. */
        let loadSeq = 0;
        /** The projects ever opened; `null` until read from storage at the first load. */
        const opened = ref<ReadonlySet<string> | null>(null);
        const onboarding = ref<ConversationRef | null>(null);
        /** App setup is asked for once per app start, by the first load. */
        let appSetupAsked = false;

        const state = reactive({
            /** Sorted by name, as the daemon sorts them; `null` until loaded. */
            projects: computed(() => projects.value),
            /** Why the projects could not be loaded; `null` when they were, or have not been tried yet. */
            loadError: computed(() => loadError.value),
            /**
             * App setup's onboarding conversation when the daemon has just started it, with App setup listed already,
             * until the app opens it.
             */
            onboarding: computed(() => onboarding.value),
        });

        events.event.on(onEvent);

        return {
            state,
            getProjects,
            create,
            getLastOpened,
            setLastOpened,
            isNew,
            markOpened,
            takeOnboarding,
        };

        /** The projects, loaded from the daemon on the first call. */
        async function getProjects(): Promise<readonly Project[]> {
            return projects.value ?? (await loader.execute());
        }

        /**
         * Creates a project; a created one joins the loaded list in its place by name. With no list loaded yet, the next
         * load brings it, so a failing load never turns a created project into a failure.
         */
        async function create(name: string): Promise<ProjectCreateResult> {
            const result = await daemon(ProjectCreateEndpoint, { name });
            if ('created' in result && projects.value !== null) {
                const others = projects.value.filter(project => project.id !== result.created.id);
                projects.value = [...others, result.created].toSorted(compareProjectsByName);
            } else if ('created' in result) {
                loader.execute().catch(() => {
                    // The store keeps the failure, which the shell shows.
                });
            }
            return result;
        }

        /** The project opened last, if it is still among `list`. */
        function getLastOpened(list: readonly Project[]) {
            const id = localStorage.getItem(LAST_OPENED_KEY);
            return list.find(project => project.id === id);
        }

        /** Remembers the project opened now, for the next start. */
        function setLastOpened(id: string) {
            localStorage.setItem(LAST_OPENED_KEY, id);
        }

        /** Whether the project has never been opened here; App setup never counts as new. */
        function isNew(project: Project) {
            return project.role !== 'appSetup' && opened.value !== null && !opened.value.has(project.id);
        }

        /** Remembers that the project has been opened: it is no longer new. */
        function markOpened(id: string) {
            if (opened.value === null || opened.value.has(id)) {
                return;
            }
            const next = new Set(opened.value).add(id);
            opened.value = next;
            localStorage.setItem(OPENED_KEY, JSON.stringify([...next]));
        }

        /** App setup's onboarding conversation when the daemon has just started it, once: the app opens it on day one. */
        function takeOnboarding() {
            const taken = onboarding.value;
            onboarding.value = null;
            return taken;
        }

        async function load() {
            const seq = ++loadSeq;
            if (!appSetupAsked) {
                appSetupAsked = true;
                void startAppSetup();
            }
            try {
                const list = await daemon(ProjectListEndpoint);
                opened.value ??= readOpened(list);
                if (seq === loadSeq) {
                    projects.value = list;
                    loadError.value = null;
                }
                return list;
            } catch (error) {
                if (seq === loadSeq) {
                    loadError.value = error instanceof Error ? error.message : String(error);
                }
                throw error;
            }
        }

        /**
         * Asks the daemon for App setup, beside the first load. An onboarding started just now may come with App setup
         * created just now, so the projects are listed again before it is offered; a failure leaves the projects as
         * they are.
         */
        async function startAppSetup() {
            let result;
            try {
                result = await daemon(AppSetupStartEndpoint, {
                    language: language.current,
                    conversationTitle: translator(l.onboardingTitle),
                });
            } catch (error) {
                logger.warn('App setup could not be started', { error });
                return;
            }
            if (result.onboarding) {
                await reload();
                onboarding.value = result.onboarding;
            }
        }

        /**
         * The projects ever opened, from storage. Nothing stored yet (the first start of a version that marks projects
         * new): every project listed now counts as opened, so only those that appear later are marked new.
         */
        function readOpened(list: readonly Project[]): ReadonlySet<string> {
            const stored = parseStoredIds(localStorage.getItem(OPENED_KEY));
            if (stored) {
                return new Set(stored);
            }
            const ids = list.map(project => project.id);
            localStorage.setItem(OPENED_KEY, JSON.stringify(ids));
            return new Set(ids);
        }

        /** Lists the projects again, past a load already running, which may have read the folder before the change. */
        async function reload() {
            loader.reset();
            await loader.execute().catch(() => {
                // The store keeps the failure; a list shown already stays.
            });
        }

        function onEvent(event: DaemonEvent) {
            switch (event.type) {
                case 'projectsChanged':
                case 'streamRestored':
                    // Only a list asked for already: the first load is the shell's.
                    if (projects.value !== null || loadError.value !== null) {
                        void reload();
                    }
                    break;
                case 'memoryChanged':
                case 'projectFilesChanged':
                case 'fileAgentChanged':
                case 'schedulesChanged':
                case 'pluginsChanged':
                case 'pluginInstalled':
                case 'conversationCreated':
                case 'conversationRenamed':
                case 'runningChanged':
                case 'textDelta':
                case 'stepStarted':
                case 'stepFinished':
                case 'stepFailed':
                case 'runFinished':
                    break;
                default:
                    assertNever(event);
            }
        }
    },
});
