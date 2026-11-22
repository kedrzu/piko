import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { assertNever } from '@nzyme/utils/assertNever.js';
import { createSingleRunner } from '@nzyme/utils/createSingleRunner.js';
import { computed, reactive, ref, shallowReactive } from 'vue';

import type { DaemonEvent } from '@piko/common/api/DaemonEventTypes.js';
import { ScheduleDeleteEndpoint } from '@piko/common/api/ScheduleDeleteEndpoint.js';
import { ScheduleListEndpoint } from '@piko/common/api/ScheduleListEndpoint.js';
import { ScheduleRunListEndpoint } from '@piko/common/api/ScheduleRunListEndpoint.js';
import type { Schedule, ScheduleRef, ScheduleRun, ScheduleUpdateInput } from '@piko/common/api/ScheduleTypes.js';
import { ScheduleUpdateEndpoint } from '@piko/common/api/ScheduleUpdateEndpoint.js';

import { DaemonClient } from '@/daemon/DaemonClient.js';
import { DaemonEventStream } from '@/daemon/DaemonEventStream.js';

/** A schedule's runs as the store holds them. */
export interface ScheduleRuns {
    /** Newest first; `null` until loaded. */
    runs: readonly ScheduleRun[] | null;
    /** Why they could not be loaded; `null` when they were, or are loading. */
    error: string | null;
}

/**
 * Every schedule of the profile, from all its projects, as the daemon lists them, and the runs of the schedules asked
 * for; both kept current by the daemon's events (a schedule written, changed or run in a project lists that project's
 * again). Changing or removing a schedule throws the daemon's `HttpError` (`@nzyme/fetch-utils`): 404 when the schedule
 * is gone, 400 with what is wrong in its `message` when the change is invalid.
 */
export const ScheduleStore = defineService({
    name: 'ScheduleStore',
    deps: { daemon: DaemonClient, events: DaemonEventStream, logger: Logger },
    setup({ daemon, events, logger }) {
        /** `null` until loaded. */
        const schedules = ref<Schedule[] | null>(null);
        const loadError = ref<string | null>(null);
        const loader = createSingleRunner({ handler: loadSchedules });
        /** Counts loads, so the answer of a load started before a newer one never replaces the newer list. */
        let loadSeq = 0;
        /** The runs asked for, by `toKey()`; an entry is replaced, never changed. */
        const runs = shallowReactive(new Map<string, ScheduleRuns>());
        /** The schedule each key of `runs` is. */
        const refs = new Map<string, ScheduleRef>();
        /** The runs being loaded, by key, with the load's number: an older load's answer is dropped. */
        const runLoads = new Map<string, number>();
        let runLoadSeq = 0;

        const state = reactive({
            /** Sorted by project, then name, as the daemon sorts them; `null` until loaded. */
            schedules: computed(() => schedules.value),
            /** Why the schedules could not be listed; `null` once they were, or before the first try. */
            loadError: computed(() => loadError.value),
        });

        events.event.on(onEvent);

        return { state, load, runsOf, retryRuns, update, remove };

        /**
         * Lists the schedules unless they are listed already; the events keep them current from then on. A failure is
         * kept in `state.loadError`, and the next call tries again.
         */
        async function load() {
            if (schedules.value === null) {
                await loader.execute().catch(() => {
                    // Kept in `loadError`.
                });
            }
        }

        /** A schedule's runs; loads them the first time they are asked for. */
        function runsOf(schedule: ScheduleRef): ScheduleRuns {
            const key = toKey(schedule);
            const held = runs.get(key);
            if (held === undefined && !runLoads.has(key)) {
                void loadRuns(schedule);
            }
            return held ?? { runs: null, error: null };
        }

        /** Loads a schedule's runs again, after they failed to load; the runs held stay until the answer comes. */
        async function retryRuns(schedule: ScheduleRef) {
            await loadRuns(schedule);
        }

        /** Changes a schedule and lists it as the daemon answered, with its last run. */
        async function update(input: ScheduleUpdateInput) {
            const schedule = await daemon(ScheduleUpdateEndpoint, input);
            if (schedules.value !== null) {
                schedules.value = schedules.value.map(item =>
                    item.projectId === schedule.projectId && item.id === schedule.id ? schedule : item,
                );
            }
            return schedule;
        }

        /** Removes a schedule with its runs. */
        async function remove(schedule: ScheduleRef) {
            await daemon(ScheduleDeleteEndpoint, { projectId: schedule.projectId, scheduleId: schedule.scheduleId });
            if (schedules.value !== null) {
                schedules.value = schedules.value.filter(
                    item => item.projectId !== schedule.projectId || item.id !== schedule.scheduleId,
                );
            }
            runs.delete(toKey(schedule));
            refs.delete(toKey(schedule));
        }

        async function loadSchedules() {
            const seq = ++loadSeq;
            try {
                const list = await daemon(ScheduleListEndpoint, {});
                if (seq === loadSeq) {
                    schedules.value = list;
                    loadError.value = null;
                }
            } catch (error) {
                logger.warn('Schedules could not be listed', { error });
                if (seq === loadSeq) {
                    loadError.value = error instanceof Error ? error.message : String(error);
                }
                throw error;
            }
        }

        /** Lists the schedules again, past a load already running, which may have read them before the change. */
        function reload() {
            // Only a list asked for already: the first load is a screen's.
            if (schedules.value !== null || loadError.value !== null) {
                loader.reset();
                loader.execute().catch(() => {
                    // Kept in `loadError`; a list shown already stays.
                });
            }
        }

        /** Loads a schedule's runs; the runs shown already stay until the answer comes. */
        async function loadRuns(schedule: ScheduleRef) {
            const key = toKey(schedule);
            const seq = ++runLoadSeq;
            runLoads.set(key, seq);
            refs.set(key, { projectId: schedule.projectId, scheduleId: schedule.scheduleId });
            let loaded: ScheduleRuns;
            try {
                const list = await daemon(ScheduleRunListEndpoint, {
                    projectId: schedule.projectId,
                    scheduleId: schedule.scheduleId,
                });
                loaded = { runs: list, error: null };
            } catch (error) {
                logger.warn('Schedule runs could not be listed', { ...schedule, error });
                loaded = { runs: null, error: error instanceof Error ? error.message : String(error) };
            }
            if (runLoads.get(key) === seq) {
                runLoads.delete(key);
                runs.set(key, loaded);
            }
        }

        /** Loads again the runs held of the project's schedules, or of every project's. */
        function reloadRuns(projectId?: string) {
            for (const schedule of refs.values()) {
                if (projectId === undefined || schedule.projectId === projectId) {
                    void loadRuns(schedule);
                }
            }
        }

        function onEvent(event: DaemonEvent) {
            switch (event.type) {
                case 'schedulesChanged':
                    reload();
                    reloadRuns(event.projectId);
                    break;
                case 'streamRestored':
                    reload();
                    reloadRuns();
                    break;
                case 'projectsChanged':
                case 'projectFilesChanged':
                case 'fileAgentChanged':
                case 'memoryChanged':
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

function toKey(schedule: ScheduleRef) {
    return JSON.stringify([schedule.projectId, schedule.scheduleId]);
}
