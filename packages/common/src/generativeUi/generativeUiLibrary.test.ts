import { expect, test } from 'bun:test';

import { createStreamingParser, evaluateRoot } from '@openuidev/lang-core';
import type { ElementNode } from '@openuidev/lang-core';

import { GenerativeUiLibrary, GenerativeUiRoot, GenerativeUiSchema } from './generativeUiLibrary.js';

const program = `root = Stack([intro, form])
intro = Text("What should I help you with?")
form = Form("areas", [areas, note], [send])
areas = CheckboxGroup("areas", "Areas", ["Work", "Studies", "Home"], true)
note = TextArea("note", "Anything else?")
send = Button("Send", "primary")
`;

test('every component has a description and a signature derived from its props', () => {
    const spec = GenerativeUiLibrary.toSpec();
    const signatures = Object.fromEntries(
        Object.entries(spec.components).map(([name, component]) => [name, component.signature]),
    );

    expect(signatures).toEqual({
        Stack: 'Stack(children: (Text | Buttons | Form)[])',
        Text: 'Text(text: string)',
        Buttons: 'Buttons(buttons: Button[])',
        Button: 'Button(label: string, variant?: "primary" | "secondary")',
        Form: 'Form(name: string, fields: (TextInput | TextArea | Select | CheckboxGroup)[], buttons: Button[])',
        TextInput: 'TextInput(name: string, label: string, placeholder?: string, required?: boolean)',
        TextArea: 'TextArea(name: string, label: string, placeholder?: string, required?: boolean)',
        Select: 'Select(name: string, label: string, options: string[], required?: boolean)',
        CheckboxGroup: 'CheckboxGroup(name: string, label: string, options: string[], required?: boolean)',
    });
    for (const component of Object.values(GenerativeUiLibrary.components)) {
        expect(component.description).not.toBe('');
    }
});

test('parses a program into elements with props', () => {
    const result = createStreamingParser(GenerativeUiSchema, GenerativeUiRoot).set(program, true);
    const root = evaluateRoot(result, {
        ctx: { getState: () => null, resolveRef: () => null },
        library: GenerativeUiLibrary,
        store: null,
    });

    expect(result.meta.errors).toEqual([]);
    expect(result.meta.incomplete).toBe(false);
    const [intro, form] = childrenOf(root);
    expect(intro).toMatchObject({ typeName: 'Text', props: { text: 'What should I help you with?' } });
    expect(form).toMatchObject({ typeName: 'Form', props: { name: 'areas' } });

    const [areas, note] = childrenOf(form, 'fields');
    expect(areas?.props).toEqual({
        name: 'areas',
        label: 'Areas',
        options: ['Work', 'Studies', 'Home'],
        required: true,
    });
    expect(note).toMatchObject({ typeName: 'TextArea', props: { name: 'note', label: 'Anything else?' } });

    const [button] = childrenOf(form, 'buttons');
    expect(button?.props).toEqual({ label: 'Send', variant: 'primary' });
});

test('a legacy ToAssistant button reports excess-args and never yields an action the app would read', () => {
    const legacy = 'root = Stack([Buttons([send])])\nsend = Button("Send", @ToAssistant("Hidden text"), "primary")\n';

    const result = createStreamingParser(GenerativeUiSchema, GenerativeUiRoot).set(legacy, true);
    const root = evaluateRoot(result, {
        ctx: { getState: () => null, resolveRef: () => null },
        library: GenerativeUiLibrary,
        store: null,
    });

    expect(result.meta.errors.map(error => error.code)).toEqual(['excess-args']);
    const [buttons] = childrenOf(root);
    const [button] = childrenOf(buttons, 'buttons');
    expect(button?.props).toHaveProperty('label', 'Send');
    expect(button?.props).not.toHaveProperty('action');
    expect(button?.props['variant']).toEqual({ steps: [{ type: 'continue_conversation', message: 'Hidden text' }] });
});

test('returns a partial tree for a program cut off mid-statement', () => {
    const cutOff = 'root = Stack([intro, buttons])\nintro = Text("Pick one")\nbuttons = Buttons([Button("Yes", @ToAss';

    const result = createStreamingParser(GenerativeUiSchema, GenerativeUiRoot).set(cutOff, false);

    expect(result.meta.incomplete).toBe(true);
    expect(childrenOf(result.root)[0]).toMatchObject({ typeName: 'Text', props: { text: 'Pick one' } });
});

test('returns a result for an unknown component without throwing', () => {
    const parser = createStreamingParser(GenerativeUiSchema, GenerativeUiRoot);

    const result = parser.set('root = Stack([Carousel("a"), Text("still here")])\n', true);

    expect(result.root?.typeName).toBe('Stack');
    expect(JSON.stringify(result.root)).toContain('still here');
});

function childrenOf(node: ElementNode | null | undefined, prop = 'children'): (ElementNode | undefined)[] {
    const value = node?.props[prop];
    if (!Array.isArray(value)) {
        throw new TypeError(`${prop} is not an array`);
    }
    return value.filter((item): item is ElementNode => typeof item === 'object' && item !== null);
}
