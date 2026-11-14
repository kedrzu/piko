---
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

- Write ONE fenced block tagged `openui` in your reply, at the END of the reply. Then end your turn and wait: the
  person's answer is their next message.
- The block holds a program, one statement per line: `name = Expression`.
- Start with `root = Stack([...])`, then define everything it references. This order renders best
  while you are still writing.
- Call components with positional arguments, in the order of the signature. Write `null` to skip an optional argument
  that is followed by one you need.
- Strings are in double quotes, arrays are `[a, b]`.
- The only action is `@ToAssistant("message")` on a Button. No other `@` functions, no `$state`, no Query or Mutation.
- Write labels and messages in the person's language. A Button's message is what the person says by clicking it:
  write it in their voice ("Monday morning suits me"), not as a command to you.
- Keep it small: a question with up to about 6 choices, a form with up to about 5 fields.
- Never ask for passwords, card numbers, codes or other secrets in a field.

## Components

- `Stack(children: (Text | Buttons | Form)[])`: The root: shows its children one below another.
- `Text(text: string)`: A paragraph of plain text: an introduction, a question or an explanation.
- `Buttons(buttons: Button[])`: A row of choices: one click answers. Use for a question with a few fixed answers.
- `Button(label: string, action: ActionExpression, variant?: "primary" | "secondary")`: One button. Its action is what happens on click: @ToAssistant(message) sends the message as the answer in the conversation.
- `Form(name: string, fields: (TextInput | TextArea | Select | CheckboxGroup)[], buttons: Button[])`: A small form: named fields plus buttons. Submitting sends the field values with the button message back as the answer.
- `TextInput(name: string, label: string, placeholder?: string, required?: boolean)`: A single-line text field inside a Form.
- `TextArea(name: string, label: string, placeholder?: string, required?: boolean)`: A multi-line text field inside a Form, for longer answers.
- `Select(name: string, label: string, options: string[], required?: boolean)`: A dropdown inside a Form: pick exactly one of the options (each option is its own label).
- `CheckboxGroup(name: string, label: string, options: string[], required?: boolean)`: Checkboxes inside a Form: pick any number of the options (each option is its own label).

## What comes back

- A Button outside a Form sends its message as the person's message.
- A Button in a Form sends its message, then a blank line, then one `Label: value` line per filled field, in field order.
  Empty fields are left out. A CheckboxGroup's value is the chosen options joined with `, `; a Select's value is the
  chosen option.

## Examples

A choice:

```openui
root = Stack([intro, choices])
intro = Text("Which day suits you for the weekly summary?")
choices = Buttons([monday, friday])
monday = Button("Monday morning", @ToAssistant("Monday morning"), "primary")
friday = Button("Friday afternoon", @ToAssistant("Friday afternoon"), "secondary")
```

A form:

```openui
root = Stack([intro, form])
intro = Text("Tell me a bit about your week.")
form = Form("week", [topics, notes], [send])
topics = CheckboxGroup("topics", "What should I cover?", ["Email", "Calendar", "Invoices"])
notes = TextArea("notes", "Anything else?", "For example, a client to watch")
send = Button("Send", @ToAssistant("Here is my answer"), "primary")
```
