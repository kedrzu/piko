import type { ConversationAgentPart, ConversationStepPart } from '@piko/common/api/ConversationTypes.js';

// The replies screens 56–61 draw, for the stories of the conversation's components.

/** The four steps of screen 56's reply, all done. */
export const WINTER_ROUTINE_STEPS: ConversationStepPart[] = [
    { type: 'step', id: 's1', kind: 'readFile', target: 'notatki.md', status: 'done' },
    { type: 'step', id: 's2', kind: 'searchWeb', target: 'pielęgnacja skóry suchej zimą', status: 'done' },
    { type: 'step', id: 's3', kind: 'runCommand', target: 'ls -la', status: 'done' },
    { type: 'step', id: 's4', kind: 'writeFile', target: 'plan.md', status: 'done' },
];

/** Screen 56: the agent writing, the last step still running. */
export const WINTER_ROUTINE_RUNNING: ConversationAgentPart[] = [
    {
        type: 'text',
        text: 'Dobrze. Najpierw zajrzę do Twoich notatek i sprawdzę, co dermatolodzy polecają na zimę, a plan zapiszę w pliku plan.md.',
    },
    ...WINTER_ROUTINE_STEPS.slice(0, 3),
    { type: 'step', id: 's4', kind: 'writeFile', target: 'plan.md', status: 'running' },
    { type: 'text', text: 'Rano wystarczą cztery kroki: łagodny żel, serum z witaminą C, krem z' },
];

/** Screen 57's reply in Markdown: headings, a numbered list with bold leads, a link and a code block. */
export const WINTER_ROUTINE_MARKDOWN = `# Poranna rutyna na zimę

Piszesz w notatkach, że skóra zimą jest sucha i łatwo się czerwieni, więc rutyna jest krótka i łagodna. Zajmie około pięciu minut.

1. **Łagodne mycie** — żel bez SLS i letnia woda
2. **Serum z witaminą C** — kilka kropli na suchą skórę
3. **Krem z ceramidami** — odbudowuje barierę ochronną
4. **Filtr SPF 30** — także w pochmurne dni

Na podstawie: [zalecenia dermatologów na zimę](https://example.com/zima)

## Przypomnienie w telefonie

Skopiuj tę treść do przypomnienia na 7:00:

\`\`\`
07:00  mycie → serum C → krem z ceramidami → SPF 30
\`\`\`

Cały plan jest też w pliku plan.md w tym projekcie.`;

/** Screen 57: the finished reply. */
export const WINTER_ROUTINE_FINISHED: ConversationAgentPart[] = [
    {
        type: 'text',
        text: 'Dobrze. Najpierw zajrzę do Twoich notatek i sprawdzę, co dermatolodzy polecają na zimę, a plan zapiszę w pliku plan.md.',
    },
    ...WINTER_ROUTINE_STEPS,
    { type: 'text', text: WINTER_ROUTINE_MARKDOWN },
];

/** Model output trying to inject markup and script, for the stories proving it renders as text. */
export const HOSTILE_MARKDOWN = `Zwykły tekst, potem próby:

<img src="x" onerror="window.__injected = true">

<script>window.__injected = true</script>

<iframe src="https://example.com"></iframe>

Tekst z <b onclick="window.__injected = true">pogrubieniem w HTML</b> w środku.

[link ze skryptem](javascript:window.__injected=true) i [link z danymi](data:text/html,<script>alert(1)</script>)

[link bez szyfrowania](http://example.com/niezaszyfrowany)

![obrazek](https://example.com/tracker.png)

[bezpieczny link](https://example.com/bezpieczny)`;

const PLAN_UI = `root = Stack([intro, form])
intro = Text("Żeby ułożyć plan, potrzebuję kilku informacji.")
form = Form("plan", [areas], [send])
areas = CheckboxGroup("areas", "Czym mam się zająć?", ["Sen", "Jedzenie", "Ruch"], true)
send = Button("Ułóż plan", @ToAssistant("Ułóż mi plan"), "primary")
`;

const CHOICE_UI = `root = Stack([choices])
choices = Buttons([sleep, food])
sleep = Button("Sen", @ToAssistant("Zacznijmy od snu"))
food = Button("Jedzenie", @ToAssistant("Zacznijmy od jedzenia"))
`;

/** A reply with a form: text, the openui block, then a closing sentence. */
export const PLAN_FORM_TEXT = `Żeby ułożyć plan, potrzebuję kilku informacji.\n\n\`\`\`openui\n${PLAN_UI}\`\`\`\n\nDaj znać, a ułożę go od razu.`;

/** The same reply, cut off while the agent writes the block: no closing fence yet. */
export const PLAN_FORM_HALF_WRITTEN = PLAN_FORM_TEXT.slice(0, PLAN_FORM_TEXT.indexOf('areas = ') + 40);

/** Two replies' worth of UI in one message: buttons, a sentence between, then a form. */
export const TWO_UIS_TEXT = `Najpierw wybierz, od czego zaczynamy.\n\n\`\`\`openui\n${CHOICE_UI}\`\`\`\n\nA potem uzupełnij formularz.\n\n\`\`\`openui\n${PLAN_UI}\`\`\``;

/** A reply ending with equal choices under its text. */
export const CHOICES_TEXT = `Od czego zaczynamy?\n\n\`\`\`openui\n${CHOICE_UI}\`\`\``;
