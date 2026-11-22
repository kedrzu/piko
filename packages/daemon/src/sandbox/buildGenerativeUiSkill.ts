import { GenerativeUiLibrary, GenerativeUiRoot } from '@piko/common/generativeUi/generativeUiLibrary.js';

/**
 * The `generative-ui` skill: when the agent shows choices or a small form, and the subset of OpenUI Lang it may write.
 * The component signatures and descriptions come from the library the app renders, so the skill cannot drift from it.
 * Not lang-core's `generateSystemPrompt`: that one also teaches state, `@Set`, queries and a "whole response is code"
 * mode, none of which the app supports.
 *
 * Only `scripts/generateGenerativeUiSkill.ts` calls it; the daemon ships the generated text, so lang-core and zod stay
 * out of the compiled sidecar.
 */
export function buildGenerativeUiSkill(): string {
    const components = Object.entries(GenerativeUiLibrary.toSpec().components).map(
        ([name, { signature, description }]) => `- \`${signature}\`: ${description ?? name}`,
    );

    return `---
name: generative-ui
description: Show choices or a small form in the conversation instead of making the person type. Use it when a question has a few fixed answers, or when you need several short facts at once.
---

# Generative UI

You can show the person buttons or a small form inside your reply. They click or fill it in and send it, and their
answer arrives as their next message.

## When to use it

Use it when a few choices or a small form save the person typing: they do not know what to write, the question has fixed
answers, or you need several short facts at once. Do not use it for open questions, and never instead of explaining:
write your explanation as normal text first.

## How to show it

- Write ONE fenced block tagged \`openui\` in your reply, at the END of the reply. Then end your turn and wait: the
  person's answer is their next message.
- The block holds a program, one statement per line: \`name = Expression\`.
- Start with \`root = ${GenerativeUiRoot}([...])\`, then define everything it references. This order renders best
  while you are still writing.
- Call components with positional arguments, in the order of the signature. Write \`null\` to skip an optional argument
  that is followed by one you need.
- Strings are in double quotes, arrays are \`[a, b]\`.
- Nothing is hidden: the person's answer is exactly what they saw and chose. A Button has only a label; clicking it
  answers with that label. There are no actions: no \`@\` functions at all, no \`$state\`, no Query or Mutation.
- Give every \`Buttons\` row and every \`Form\` its own statement (\`day = Buttons([...])\`,
  \`form = Form("week", ...)\`): the statement name of a row, and a form's \`name\`, tell you which question an answer
  is for. Give every field a distinct \`name\`.
- Write labels in the person's language, so they read well as the answer too ("Monday morning").
- Ask related questions together, as fields of one Form, rather than one question per reply.
- Keep it small: a question with up to about 6 choices, a form with up to about 5 fields.
- Never ask for passwords, card numbers, codes or other secrets in a field.

## Components

${components.join('\n')}

## What comes back

The person's next message is one fenced \`json\` block:

- A Buttons row: \`{"choices": "<statement name>", "button": "<the clicked label>"}\`.
- A Form: \`{"form": "<its name>", "button": "<the clicked label>", "fields": {"<field name>": {"label": "...",
  "value": ...}}}\`. Only filled fields are listed, in field order. A CheckboxGroup's value is the list of chosen
  options; any other field's value is a string.

The person may also ignore the UI and type a plain message instead.

## Examples

A choice:

\`\`\`openui
root = Stack([intro, day])
intro = Text("Which day suits you for the weekly summary?")
day = Buttons([monday, friday])
monday = Button("Monday morning", "primary")
friday = Button("Friday afternoon", "secondary")
\`\`\`

A form:

\`\`\`openui
root = Stack([intro, form])
intro = Text("Tell me a bit about your week.")
form = Form("week", [topics, notes], [send])
topics = CheckboxGroup("topics", "What should I cover?", ["Email", "Calendar", "Invoices"])
notes = TextArea("notes", "Anything else?", "For example, a client to watch")
send = Button("Send", "primary")
\`\`\`
`;
}
