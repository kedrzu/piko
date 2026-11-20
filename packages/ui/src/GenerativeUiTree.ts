import { isElementNode } from '@openuidev/lang-core';
import type { ElementNode } from '@openuidev/lang-core';

import { GenerativeUiButtonVariants } from '@piko/common/generativeUi/generativeUiLibrary.js';

/** Visual weight of a generative UI button, as the program names it. */
export type GenerativeUiButtonVariant = (typeof GenerativeUiButtonVariants)[number];

/** A button the person can click: its label and the message a click sends. */
export interface GenerativeUiButton {
    label: string;
    message: string;
    variant: GenerativeUiButtonVariant | undefined;
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
    fields: GenerativeUiField[];
    buttons: GenerativeUiButton[];
}

/** One block of a generative UI, shown one below another. */
export type GenerativeUiBlock =
    | { type: 'Text'; text: string }
    | { type: 'Buttons'; buttons: GenerativeUiButton[] }
    | GenerativeUiForm;

/**
 * The blocks of an evaluated OpenUI tree (`root = Stack([...])`), narrowed from its untyped props. Whatever is not
 * yet complete or does not fit the library — a cut-off element, an unknown component, a button whose action is not a
 * message to the assistant — is left out, so a program still streaming or partly broken shows its valid part.
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
            return buttons.length > 0 ? { type: 'Buttons', buttons } : null;
        }
        case 'Form': {
            const fields = readFields(props['fields']);
            const buttons = readButtons(props['buttons']);
            return fields.length > 0 || buttons.length > 0 ? { type: 'Form', fields, buttons } : null;
        }
        default:
            return null;
    }
}

function readButtons(value: unknown): GenerativeUiButton[] {
    const buttons: GenerativeUiButton[] = [];
    for (const element of elementsOf(value)) {
        const label = element.props['label'];
        const message = readMessage(element.props['action']);
        if (element.typeName === 'Button' && typeof label === 'string' && label !== '' && message != null) {
            buttons.push({ label, message, variant: readVariant(element.props['variant']) });
        }
    }
    return buttons;
}

/** The message of an action plan's `continue_conversation` step (`@ToAssistant`); other steps are ignored. */
function readMessage(action: unknown): string | null {
    if (typeof action !== 'object' || action === null || !('steps' in action)) {
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
