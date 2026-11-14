import { useForm } from '@nzyme/vue-forms/useForm.js';
import { defineContext } from '@nzyme/vue-utils/context.js';

/** What a generative UI form holds: each field's value by its name, text or the chosen options. */
export type GenerativeUiFormValues = Record<string, string | readonly string[]>;

/**
 * The state of one generative UI form, provided by `GenerativeUiForm` to its fields. Its fields come from the
 * agent's program and arrive while it streams, so each `GenerativeUiField` registers itself rather than the form
 * declaring them up front.
 */
export const GenerativeUiFormContext = defineContext('GenerativeUiFormContext', () =>
    useForm<GenerativeUiFormValues>({}),
);
