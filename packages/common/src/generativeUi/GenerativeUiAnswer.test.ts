import { expect, test } from 'bun:test';

import { buildGenerativeUiAnswerText, readGenerativeUiAnswer } from './GenerativeUiAnswer.js';
import type { GenerativeUiAnswer } from './GenerativeUiAnswer.js';

const formAnswer: GenerativeUiAnswer = {
    kind: 'generativeUiAnswer',
    source: 'form',
    name: 'areas',
    button: 'Send',
    defaultButton: true,
    fields: [
        { name: 'areas', label: 'Areas', value: ['Work', 'Home'] },
        { name: 'note', label: 'Anything else?', value: 'Line one\nLine "two": done' },
    ],
};

test('reads a stored answer back, dropping keys it does not know', () => {
    const stored: unknown = JSON.parse(JSON.stringify({ ...formAnswer, extra: 1 }));

    expect(readGenerativeUiAnswer(stored)).toEqual(formAnswer);
    expect(readGenerativeUiAnswer(stored)).not.toHaveProperty('extra');
});

test('reads a choice answer without a name', () => {
    const answer: GenerativeUiAnswer = {
        kind: 'generativeUiAnswer',
        source: 'choices',
        button: 'Yes',
        defaultButton: true,
        fields: [],
    };

    expect(readGenerativeUiAnswer(JSON.parse(JSON.stringify(answer)))).toEqual(answer);
});

test.each([
    ['null', null],
    ['a string', 'answer'],
    ['the wrong kind', { ...formAnswer, kind: 'other' }],
    ['an unknown source', { ...formAnswer, source: 'menu' }],
    ['a missing button', { ...formAnswer, button: undefined }],
    ['a missing defaultButton', { ...formAnswer, defaultButton: undefined }],
    ['a non-string name', { ...formAnswer, name: 3 }],
    ['fields that are not an array', { ...formAnswer, fields: {} }],
    ['a field value of the wrong type', { ...formAnswer, fields: [{ name: 'a', label: 'A', value: 5 }] }],
    ['a field value array with junk', { ...formAnswer, fields: [{ name: 'a', label: 'A', value: ['x', 2] }] }],
    ['a field without a label', { ...formAnswer, fields: [{ name: 'a', value: 'x' }] }],
    ['a non-object field', { ...formAnswer, fields: ['a'] }],
])('rejects %s', (_title, value) => {
    expect(readGenerativeUiAnswer(value)).toBeUndefined();
});

test('builds a form answer as one fenced JSON block that keeps free text intact', () => {
    const text = buildGenerativeUiAnswerText(formAnswer);

    expect(text.startsWith('```json\n')).toBe(true);
    expect(text.endsWith('\n```')).toBe(true);
    expect(JSON.parse(text.slice('```json\n'.length, -'\n```'.length))).toEqual({
        form: 'areas',
        button: 'Send',
        fields: {
            areas: { label: 'Areas', value: ['Work', 'Home'] },
            note: { label: 'Anything else?', value: 'Line one\nLine "two": done' },
        },
    });
});

test('builds a choices answer, omitting the name key for an inline row', () => {
    const answer: GenerativeUiAnswer = {
        kind: 'generativeUiAnswer',
        source: 'choices',
        name: 'pick',
        button: 'Yes',
        defaultButton: true,
        fields: [],
    };

    expect(buildGenerativeUiAnswerText(answer)).toBe('```json\n{\n  "choices": "pick",\n  "button": "Yes"\n}\n```');
    expect(buildGenerativeUiAnswerText({ ...answer, name: undefined })).toBe('```json\n{\n  "button": "Yes"\n}\n```');
});
