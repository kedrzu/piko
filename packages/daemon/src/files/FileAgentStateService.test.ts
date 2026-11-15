import { expect, test } from 'bun:test';

import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

import type { FileAgentChangedEvent, FileAgentState } from '@poweragents/common/api/DaemonEventTypes.js';

import { FileAgentStateService } from './FileAgentStateService.js';
import type { ProjectFileRef } from './FileAgentStateService.js';

const PLAN: ProjectFileRef = { projectId: 'p1', path: 'notes/plan.md' };
const TODO: ProjectFileRef = { projectId: 'p1', path: 'todo.md' };

test('a file is writing while any call that writes it runs, and null once the last one ends', () => {
    const { service, events } = setup();

    service.toolStarted({ conversationId: 'ses_1', callId: 'c1', files: [PLAN] });
    service.toolStarted({ conversationId: 'ses_1', callId: 'c2', files: [PLAN, TODO] });
    service.toolEnded('ses_1', 'c1');
    service.toolEnded('ses_1', 'c2');
    // Already ended: nothing more is sent.
    service.toolEnded('ses_1', 'c2');

    const expected: FileAgentChangedEvent[] = [
        changed(PLAN, 'ses_1', 'writing'),
        changed(TODO, 'ses_1', 'writing'),
        changed(PLAN, 'ses_1', null),
        changed(TODO, 'ses_1', null),
    ];
    expect(events).toEqual(expected);
});

test("the end of a run releases that conversation's files only", () => {
    const { service, events } = setup();
    service.toolStarted({ conversationId: 'ses_1', callId: 'c1', files: [PLAN] });
    service.toolStarted({ conversationId: 'ses_2', callId: 'c1', files: [TODO] });
    events.length = 0;

    service.runEnded('ses_1');

    const expected: FileAgentChangedEvent[] = [changed(PLAN, 'ses_1', null)];
    expect(events).toEqual(expected);
});

test('a reset releases every file, and a listener after it hears nothing of them', () => {
    const { service, events } = setup();
    service.toolStarted({ conversationId: 'ses_1', callId: 'c1', files: [PLAN] });
    service.toolStarted({ conversationId: 'ses_2', callId: 'c1', files: [TODO] });
    events.length = 0;

    service.reset();

    const expected: FileAgentChangedEvent[] = [changed(PLAN, 'ses_1', null), changed(TODO, 'ses_2', null)];
    expect(events).toEqual(expected);
    const late: FileAgentChangedEvent[] = [];
    service.listen(event => late.push(event));
    expect(late).toEqual([]);
});

test('a listener that comes later hears the files being written now at once', () => {
    const { service } = setup();
    service.toolStarted({ conversationId: 'ses_1', callId: 'c1', files: [PLAN] });
    service.toolStarted({ conversationId: 'ses_1', callId: 'c2', files: [TODO] });
    service.toolEnded('ses_1', 'c2');

    const late: FileAgentChangedEvent[] = [];
    service.listen(event => late.push(event));

    const expected: FileAgentChangedEvent[] = [changed(PLAN, 'ses_1', 'writing')];
    expect(late).toEqual(expected);
});

test('a held file is waiting over its running call, writing again once released, and null when the call ends', () => {
    const { service, events } = setup();

    service.toolStarted({ conversationId: 'ses_1', callId: 'c1', files: [PLAN] });
    service.holdStarted({ conversationId: 'ses_1', holdId: 'per_1', files: [PLAN] });
    service.holdEnded('per_1');
    service.toolEnded('ses_1', 'c1');
    // A hold of a file no call writes: waiting, then null.
    service.holdStarted({ conversationId: 'ses_1', holdId: 'per_2', files: [TODO] });
    service.holdEnded('per_2');

    const expected: FileAgentChangedEvent[] = [
        changed(PLAN, 'ses_1', 'writing'),
        changed(PLAN, 'ses_1', 'waiting'),
        changed(PLAN, 'ses_1', 'writing'),
        changed(PLAN, 'ses_1', null),
        changed(TODO, 'ses_1', 'waiting'),
        changed(TODO, 'ses_1', null),
    ];
    expect(events).toEqual(expected);
});

test('a reset keeps the holds, which the hold service owns', () => {
    const { service, events } = setup();
    service.toolStarted({ conversationId: 'ses_1', callId: 'c1', files: [PLAN] });
    service.holdStarted({ conversationId: 'ses_1', holdId: 'per_1', files: [PLAN] });
    events.length = 0;

    service.reset();
    service.holdEnded('per_1');

    // Waiting through the reset; once released, no call is known to run any more.
    const expected: FileAgentChangedEvent[] = [changed(PLAN, 'ses_1', null)];
    expect(events).toEqual(expected);
});

function setup() {
    const { container } = createTestContainer();
    const service = container.resolve(FileAgentStateService);
    const events: FileAgentChangedEvent[] = [];
    service.listen(event => events.push(event));
    return { service, events };
}

function changed(file: ProjectFileRef, conversationId: string, state: FileAgentState | null): FileAgentChangedEvent {
    return { type: 'fileAgentChanged', ...file, conversationId, state };
}
