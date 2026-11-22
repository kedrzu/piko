import type { Tab } from './TabStore.js';

/**
 * The tabs kept in `localStorage` as JSON, in their order; what is not a tab (an older shape, a hand edit) is left out,
 * and anything unreadable is no tabs.
 * @__NO_SIDE_EFFECTS__
 */
export function parseStoredTabs(stored: string | null): Tab[] {
    let value: unknown;
    try {
        value = JSON.parse(stored ?? '[]');
    } catch {
        return [];
    }
    if (!Array.isArray(value)) {
        return [];
    }
    const tabs: Tab[] = [];
    for (const item of value) {
        const tab = parseTab(item);
        if (tab) {
            tabs.push(tab);
        }
    }
    return tabs;
}

function parseTab(item: unknown): Tab | null {
    if (typeof item !== 'object' || item === null) {
        return null;
    }
    const projectId: unknown = Reflect.get(item, 'projectId');
    const title: unknown = Reflect.get(item, 'title');
    switch (Reflect.get(item, 'kind')) {
        case 'memory':
            return { kind: 'memory' };
        case 'schedules':
            return { kind: 'schedules' };
        case 'schedule': {
            const scheduleId: unknown = Reflect.get(item, 'scheduleId');
            return typeof projectId === 'string' && typeof scheduleId === 'string'
                ? { kind: 'schedule', projectId, scheduleId, title: typeof title === 'string' ? title : null }
                : null;
        }
        case 'newConversation':
            return typeof projectId === 'string' ? { kind: 'newConversation', projectId } : null;
        case 'conversation': {
            const conversationId: unknown = Reflect.get(item, 'conversationId');
            return typeof projectId === 'string' && typeof conversationId === 'string'
                ? { kind: 'conversation', projectId, conversationId, title: typeof title === 'string' ? title : null }
                : null;
        }
        case 'file': {
            const path: unknown = Reflect.get(item, 'path');
            return typeof projectId === 'string' && typeof path === 'string' ? { kind: 'file', projectId, path } : null;
        }
        default:
            return null;
    }
}
