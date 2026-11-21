import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { createParser } from '@openuidev/lang-core';

import { GenerativeUiRoot, GenerativeUiSchema } from '@piko/common/generativeUi/generativeUiLibrary.js';

import { buildGenerativeUiSkill } from './buildGenerativeUiSkill.js';

test('the generated skill file is up to date with the component library', async () => {
    const file = path.resolve(import.meta.dirname, '../../sandbox/generative-ui.skill.gen.md');

    const generated = await readFile(file, 'utf8');

    expect(generated, 'generative-ui.skill.gen.md is stale: run `bun run codegen`').toBe(buildGenerativeUiSkill());
});

test('has frontmatter with a name and a description, and lists every component signature', () => {
    const skill = buildGenerativeUiSkill();

    expect(skill).toMatch(/^---\nname: generative-ui\ndescription: .+\n---\n/);
    expect(skill).toContain('- `Button(label: string, variant?: "primary" | "secondary")`');
    expect(skill).toContain('- `Form(name: string, fields: (TextInput | TextArea | Select | CheckboxGroup)[]');
});

test('its examples are valid programs with no actions', () => {
    const examples = [...buildGenerativeUiSkill().matchAll(/```openui\n([\s\S]*?)```/g)].map(match => match[1] ?? '');

    expect(examples).toHaveLength(2);
    for (const example of examples) {
        expect(example).not.toContain('@');
        expect(createParser(GenerativeUiSchema, GenerativeUiRoot).parse(example).meta.errors).toEqual([]);
    }
});
