import { isOptionalProperty } from '../utils/isOptionalProperty.js';
import { readBoolean } from '../utils/readBoolean.js';
import { readString } from '../utils/readString.js';

/** One filled field of a submitted form, as the person saw it. */
export type GenerativeUiAnswerField = {
    name: string;
    label: string;
    value: string | string[];
};

/**
 * What a person answered to generated UI: exactly what they saw and chose, nothing hidden. A `type`, not an
 * `interface`, because it is passed as OpenCode's `metadata: Record<string, unknown>`.
 */
export type GenerativeUiAnswer = {
    kind: 'generativeUiAnswer';
    source: 'form' | 'choices';
    /** The form's `name`; the choice row's statement name. Absent for an inline row. */
    name?: string;
    /** The clicked button's label, as shown. */
    button: string;
    /** The clicked button was the form's first (the default send). Always true for choices. */
    defaultButton: boolean;
    /** Filled fields only, in form order; empty for choices. */
    fields: GenerativeUiAnswerField[];
};

/**
 * Reads an answer back from stored message metadata. Returns a fresh object with only the known keys, or
 * `undefined` unless the whole value is a well-formed answer. Hand-written, not zod: the daemon's compiled sidecar
 * imports this file and must stay free of zod and lang-core.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function readGenerativeUiAnswer(value: unknown): GenerativeUiAnswer | undefined {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }
    const source = readString(value, 'source');
    const button = readString(value, 'button');
    const defaultButton = readBoolean(value, 'defaultButton');
    const rawFields: unknown = Reflect.get(value, 'fields');
    if (
        readString(value, 'kind') !== 'generativeUiAnswer' ||
        (source !== 'form' && source !== 'choices') ||
        button === undefined ||
        defaultButton === undefined ||
        !isOptionalProperty(value, 'name', 'string') ||
        !Array.isArray(rawFields)
    ) {
        return undefined;
    }

    const fields: GenerativeUiAnswerField[] = [];
    for (const rawField of rawFields) {
        const field = readField(rawField);
        if (field === undefined) {
            return undefined;
        }
        fields.push(field);
    }

    const name = readString(value, 'name');
    return {
        kind: 'generativeUiAnswer',
        source,
        ...(name === undefined ? {} : { name }),
        button,
        defaultButton,
        fields,
    };
}

/**
 * The text the agent reads for an answer: one fenced JSON block keyed by the names the agent defined, so free
 * text with newlines, colons and quotes arrives intact. The `form` / `choices` key is omitted when the answer has
 * no name (an inline row).
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function buildGenerativeUiAnswerText(answer: GenerativeUiAnswer): string {
    const payload = answer.source === 'form' ? buildFormPayload(answer) : buildChoicesPayload(answer);
    return '```json\n' + JSON.stringify(payload, null, 2) + '\n```';
}

function buildFormPayload(answer: GenerativeUiAnswer): object {
    const fields: Record<string, { label: string; value: string | string[] }> = {};
    for (const field of answer.fields) {
        fields[field.name] = { label: field.label, value: field.value };
    }
    return { form: answer.name, button: answer.button, fields };
}

function buildChoicesPayload(answer: GenerativeUiAnswer): object {
    return { choices: answer.name, button: answer.button };
}

function readField(value: unknown): GenerativeUiAnswerField | undefined {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }
    const name = readString(value, 'name');
    const label = readString(value, 'label');
    const fieldValue: unknown = Reflect.get(value, 'value');
    if (name === undefined || label === undefined) {
        return undefined;
    }
    if (typeof fieldValue === 'string') {
        return { name, label, value: fieldValue };
    }
    if (Array.isArray(fieldValue) && fieldValue.every((item: unknown) => typeof item === 'string')) {
        return { name, label, value: [...fieldValue] };
    }
    return undefined;
}
