import { expect, test } from 'bun:test';

import { parseStoredTabs } from './parseStoredTabs.js';
import type { Tab } from './TabStore.js';

test('every kind of tab comes back as it was stored', () => {
    const tabs: Tab[] = [
        { kind: 'memory' },
        { kind: 'schedules' },
        { kind: 'schedule', projectId: 'p1', scheduleId: 's1', title: 'Sort my mail' },
        { kind: 'schedule', projectId: 'p1', scheduleId: 's2', title: null },
        { kind: 'newConversation', projectId: 'p1' },
        { kind: 'history', projectId: 'p1', filter: 's1' },
        { kind: 'history', projectId: 'p2', filter: null },
        { kind: 'conversation', projectId: 'p1', conversationId: 'c1', title: null },
        { kind: 'file', projectId: 'p1', path: 'notes/plan.md' },
    ];

    expect(parseStoredTabs(JSON.stringify(tabs))).toEqual(tabs);
});

test('what is not a tab is left out, the rest kept in order', () => {
    const stored = JSON.stringify([
        { kind: 'schedule', projectId: 'p1' },
        { kind: 'schedule', projectId: 'p1', scheduleId: 's1', title: 3 },
        { kind: 'history', filter: 'mine' },
        { kind: 'history', projectId: 'p1', filter: 7 },
        { kind: 'unknown' },
        null,
        { kind: 'schedules' },
    ]);

    const expected: Tab[] = [
        { kind: 'schedule', projectId: 'p1', scheduleId: 's1', title: null },
        { kind: 'history', projectId: 'p1', filter: null },
        { kind: 'schedules' },
    ];
    expect(parseStoredTabs(stored)).toEqual(expected);
});

test('nothing stored, or something unreadable, is no tabs', () => {
    expect([parseStoredTabs(null), parseStoredTabs('{'), parseStoredTabs('{}')]).toEqual([[], [], []]);
});
