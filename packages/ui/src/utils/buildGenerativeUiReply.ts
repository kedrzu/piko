/** A form field as it goes into a reply: its label and what the person entered or picked. */
export interface GenerativeUiReplyField {
    /** The field's visible label. */
    label: string;
    /** Text for a text field or a dropdown, the chosen options for checkboxes; empty when nothing is filled. */
    value: string | readonly string[] | null | undefined;
}

/**
 * The person's next message after a form button's click in a generative UI: the button's message, then a
 * blank line and one `Label: value` line per filled field in field order. Checkbox options are joined with `, `; a
 * multi-line value goes as is. The agent's skill reads this exact shape.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function buildGenerativeUiReply(message: string, fields: readonly GenerativeUiReplyField[]): string {
    const lines: string[] = [];
    for (const field of fields) {
        const value = typeof field.value === 'string' ? field.value : (field.value?.join(', ') ?? '');
        if (value.trim() !== '') {
            lines.push(`${field.label}: ${value}`);
        }
    }

    return lines.length > 0 ? `${message}\n\n${lines.join('\n')}` : message;
}
