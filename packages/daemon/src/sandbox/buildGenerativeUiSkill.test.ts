import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { buildGenerativeUiSkill } from './buildGenerativeUiSkill.js';

test('the generated skill file is up to date with the component library', async () => {
    const file = path.resolve(import.meta.dirname, '../../sandbox/generative-ui.skill.gen.md');

    const generated = await readFile(file, 'utf8');

    expect(generated, 'generative-ui.skill.gen.md is stale: run `bun run codegen`').toBe(buildGenerativeUiSkill());
});

test('has frontmatter with a name and a description, and lists every component signature', () => {
    const skill = buildGenerativeUiSkill();

    expect(skill).toMatch(/^---\nname: generative-ui\ndescription: .+\n---\n/);
    expect(skill).toContain('- `Button(label: string, action: ActionExpression, variant?: "primary" | "secondary")`');
    expect(skill).toContain('- `Form(name: string, fields: (TextInput | TextArea | Select | CheckboxGroup)[]');
});
