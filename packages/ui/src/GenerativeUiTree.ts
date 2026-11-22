import { isElementNode } from '@openuidev/lang-core';
import type { ElementNode } from '@openuidev/lang-core';

import { GenerativeUiButtonVariants } from '@piko/common/generativeUi/generativeUiLibrary.js';

/** Visual weight of a generative UI button, as the program names it. */
export type GenerativeUiButtonVariant = (typeof GenerativeUiButtonVariants)[number];

/** A button the person can click; a click answers with its label. */
export interface GenerativeUiButton {
    label: string;
    variant: GenerativeUiButtonVariant | undefined;
    /**
     * The `@ToAssistant` message of a program written before buttons lost their action: under `Button(label,
     * variant?)` it lands in the `variant` slot. Read only to recognise that program's plain-text answer, which was
     * this message; never shown, never sent.
     */
    legacyMessage?: string;
}

/** A field of a generative UI form; `name` keys its value, `label` names it on screen and in the reply. */
export type GenerativeUiField =
    | {
          type: 'TextInput' | 'TextArea';
          name: string;
          label: string;
          placeholder: string | undefined;
          required: boolean;
      }
    | {
          type: 'Select' | 'CheckboxGroup';
          name: string;
          label: string;
          options: string[];
          required: boolean;
      };

/** A form: its fields and the buttons that submit it. */
export interface GenerativeUiForm {
    type: 'Form';
    /** The name the agent gave the form; its answer carries it. */
    name: string | undefined;
    fields: GenerativeUiField[];
    buttons: GenerativeUiButton[];
}

/** A row of choices: one click answers. */
export interface GenerativeUiButtons {
    type: 'Buttons';
    /** The row's statement name (`day` in `day = Buttons([...])`), which its answer carries; undefined for an inline row. */
    name: string | undefined;
    buttons: GenerativeUiButton[];
}

/** One block of a generative UI, shown one below another. */
export type GenerativeUiBlock = { type: 'Text'; text: string } | GenerativeUiButtons | GenerativeUiForm;

/**
 * The blocks of an evaluated OpenUI tree (`root = Stack([...])`), narrowed from its untyped props. Whatever is not
 * yet complete or does not fit the library — a cut-off element, an unknown component, an old program's button whose
 * action is not a message to the assistant — is left out, so a program still streaming or partly broken shows its valid part.
 * @__NO_SIDE_EFFECTS__
 */
export function readGenerativeUiTree(root: ElementNode | null): GenerativeUiBlock[] {
    if (root?.typeName !== 'Stack') {
        return [];
    }

    const blocks: GenerativeUiBlock[] = [];
    for (const child of elementsOf(root.props['children'])) {
        const block = readBlock(child);
        if (block) {
            blocks.push(block);
        }
    }
    return blocks;
}

function readBlock(element: ElementNode): GenerativeUiBlock | null {
    const props = element.props;
    switch (element.typeName) {
        case 'Text': {
            const text = props['text'];
            return typeof text === 'string' && text !== '' ? { type: 'Text', text } : null;
        }
        case 'Buttons': {
            const buttons = readButtons(props['buttons']);
            return buttons.length > 0 ? { type: 'Buttons', name: element.statementId, buttons } : null;
        }
        case 'Form': {
            const fields = readFields(props['fields']);
            const buttons = readButtons(props['buttons']);
            const name = props['name'];
            return fields.length > 0 || buttons.length > 0
                ? { type: 'Form', name: typeof name === 'string' ? name : undefined, fields, buttons }
                : null;
        }
        default:
            return null;
    }
}

function readButtons(value: unknown): GenerativeUiButton[] {
    const buttons: GenerativeUiButton[] = [];
    for (const element of elementsOf(value)) {
        const label = element.props['label'];
        if (element.typeName !== 'Button' || typeof label !== 'string' || label === '') {
            continue;
        }
        const variant: unknown = element.props['variant'];
        if (typeof variant !== 'object' || variant === null) {
            buttons.push({ label, variant: readVariant(variant) });
            continue;
        }
        // An old program's action plan: kept only when it answered the assistant, as such a button did.
        const legacyMessage = readMessage(variant);
        if (legacyMessage != null) {
            buttons.push({ label, variant: undefined, legacyMessage });
        }
    }
    return buttons;
}

/** The message of an action plan's `continue_conversation` step (`@ToAssistant`); other steps are ignored. */
function readMessage(action: object): string | null {
    if (!('steps' in action)) {
        return null;
    }

    for (const step of toArray(action.steps)) {
        if (
            typeof step === 'object' &&
            step !== null &&
            'type' in step &&
            step.type === 'continue_conversation' &&
            'message' in step &&
            typeof step.message === 'string' &&
            step.message !== ''
        ) {
            return step.message;
        }
    }
    return null;
}

function readVariant(value: unknown): GenerativeUiButtonVariant | undefined {
    return GenerativeUiButtonVariants.find(variant => variant === value);
}

function readFields(value: unknown): GenerativeUiField[] {
    const fields: GenerativeUiField[] = [];
    for (const element of elementsOf(value)) {
        const field = readField(element);
        if (field) {
            fields.push(field);
        }
    }
    return fields;
}

function readField(element: ElementNode): GenerativeUiField | null {
    const { name, label, placeholder, options, required } = element.props;
    if (typeof name !== 'string' || name === '' || typeof label !== 'string' || label === '') {
        return null;
    }

    switch (element.typeName) {
        case 'TextInput':
        case 'TextArea':
            return {
                type: element.typeName,
                name,
                label,
                placeholder: typeof placeholder === 'string' ? placeholder : undefined,
                required: required === true,
            };
        case 'Select':
        case 'CheckboxGroup': {
            const strings = toArray(options).filter(option => typeof option === 'string');
            return strings.length > 0
                ? { type: element.typeName, name, label, options: strings, required: required === true }
                : null;
        }
        default:
            return null;
    }
}

function elementsOf(value: unknown): ElementNode[] {
    return toArray(value).filter(isElementNode);
}

function toArray(value: unknown): readonly unknown[] {
    return Array.isArray(value) ? value : [];
}
