/** A recurring prompt in a project: at each term the daemon starts a conversation with it. */
export interface Schedule {
    id: string;
    projectId: string;
    projectName: string;
    name: string;
    /** The recurrence in the person's words, for them to read; never interpreted. */
    when: string;
    /** The recurrence rule: an RFC 5545 RRULE value, without the `RRULE:` prefix and without DTSTART. */
    rrule: string;
    /** Local date-time `YYYY-MM-DDTHH:MM` in the computer's time zone: the anchor of the rule's interval. */
    start: string;
    /** The first message of the conversation each run starts. */
    prompt: string;
    paused: boolean;
    /** The next term (epoch ms); absent while the schedule is paused or once the rule has run out. */
    nextRunAt?: number;
    /** The newest run, from the schedule's state; absent while it has not run, or has no state. */
    lastRun?: ScheduleRun;
}

/** What became of one term of a schedule. */
export type ScheduleRunOutcome = 'started' | 'skipped' | 'failed';

/** One term of a schedule, as the daemon handled it. */
export interface ScheduleRun {
    /** The scheduled time it was for (epoch ms). */
    term: number;
    /** When the daemon handled it (epoch ms). */
    at: number;
    /**
     * `started`: a conversation was started (`conversationId`). `skipped`: the previous run still waited for the
     * person. `failed`: it could not be started, `message` says why; it is not retried.
     */
    outcome: ScheduleRunOutcome;
    /** The conversation the run started; for `failed`, only when one was created before the failure. */
    conversationId?: string;
    /** Why the run failed. */
    message?: string;
}

/** Points at one of a project's schedules. */
export interface ScheduleRef {
    projectId: string;
    scheduleId: string;
}

/** The project whose schedules to list; without it, every project's. */
export interface ScheduleListInput {
    projectId?: string;
}

/** A new schedule: the fields of {@link Schedule} the person writes. */
export interface ScheduleCreateInput {
    projectId: string;
    name: string;
    when: string;
    rrule: string;
    start: string;
    prompt: string;
}

/** The fields of a schedule to change; the ones left out stay as they are. */
export interface ScheduleUpdateInput extends ScheduleRef {
    name?: string;
    when?: string;
    rrule?: string;
    start?: string;
    prompt?: string;
    /** `true` pauses the schedule, `false` resumes it. */
    paused?: boolean;
}
