import { createLibrary, defineComponent } from '@openuidev/lang-core';
import { z } from 'zod';

/** The component every OpenUI program starts from (`root = Stack([...])`). */
export const GenerativeUiRoot = 'Stack';

/** Visual weight of a Button: `primary` is the main choice, `secondary` an alternative. */
export const GenerativeUiButtonVariants = ['primary', 'secondary'] as const;

// A component carries no text the person does not see, and an answer is exactly what the person saw and chose:
// a button answers with its label, a form with its field labels and values. Read this before adding a component:
// no action, no hidden message prop (like the former `@ToAssistant("...")`), nothing the person is not shown.
//
// Components are framework-free: `component` is null and the Vue renderer maps `typeName` to its own
// component. Key order of each props schema is the positional argument order of the OpenUI call.

const Text = defineComponent({
    name: 'Text',
    description: 'A paragraph of plain text: an introduction, a question or an explanation.',
    props: z.object({ text: z.string() }),
    component: null,
});

const Button = defineComponent({
    name: 'Button',
    description:
        'One button. Clicking it answers with its label, exactly as shown. The first button of a Form is its' +
        ' default send.',
    props: z.object({
        label: z.string(),
        variant: z.enum(GenerativeUiButtonVariants).optional(),
    }),
    component: null,
});

const Buttons = defineComponent({
    name: 'Buttons',
    description: 'A row of choices: one click answers. Use for a question with a few fixed answers.',
    props: z.object({ buttons: z.array(Button.ref) }),
    component: null,
});

const TextInput = defineComponent({
    name: 'TextInput',
    description: 'A single-line text field inside a Form.',
    props: z.object({
        name: z.string(),
        label: z.string(),
        placeholder: z.string().optional(),
        required: z.boolean().optional(),
    }),
    component: null,
});

const TextArea = defineComponent({
    name: 'TextArea',
    description: 'A multi-line text field inside a Form, for longer answers.',
    props: z.object({
        name: z.string(),
        label: z.string(),
        placeholder: z.string().optional(),
        required: z.boolean().optional(),
    }),
    component: null,
});

const Select = defineComponent({
    name: 'Select',
    description: 'A dropdown inside a Form: pick exactly one of the options (each option is its own label).',
    props: z.object({
        name: z.string(),
        label: z.string(),
        options: z.array(z.string()),
        required: z.boolean().optional(),
    }),
    component: null,
});

const CheckboxGroup = defineComponent({
    name: 'CheckboxGroup',
    description: 'Checkboxes inside a Form: pick any number of the options (each option is its own label).',
    props: z.object({
        name: z.string(),
        label: z.string(),
        options: z.array(z.string()),
        required: z.boolean().optional(),
    }),
    component: null,
});

const Form = defineComponent({
    name: 'Form',
    description:
        'A small form: named fields plus buttons. Submitting sends the filled field values and the clicked' +
        ' button label back as the answer.',
    props: z.object({
        name: z.string(),
        fields: z.array(z.union([TextInput.ref, TextArea.ref, Select.ref, CheckboxGroup.ref])),
        buttons: z.array(Button.ref),
    }),
    component: null,
});

const Stack = defineComponent({
    name: GenerativeUiRoot,
    description: 'The root: shows its children one below another.',
    props: z.object({ children: z.array(z.union([Text.ref, Buttons.ref, Form.ref])) }),
    component: null,
});

/** The components the agent may use in an `openui` block. */
export const GenerativeUiLibrary = createLibrary({
    root: GenerativeUiRoot,
    components: [Stack, Text, Buttons, Button, Form, TextInput, TextArea, Select, CheckboxGroup],
});

/** The library as the JSON schema `createStreamingParser` and `createParser` take. */
export const GenerativeUiSchema = GenerativeUiLibrary.toJSONSchema();
