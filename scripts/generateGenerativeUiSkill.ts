import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildGenerativeUiSkill } from '../packages/daemon/src/sandbox/buildGenerativeUiSkill.js';

// Writes the `generative-ui` skill from the component library (`@piko/common`, built) into
// `packages/daemon/sandbox`, where the daemon embeds it in the agent's image. Run by `bun run codegen`.

const target = path.resolve(import.meta.dirname, '../packages/daemon/sandbox/generative-ui.skill.gen.md');

await writeFile(target, buildGenerativeUiSkill());
console.log(`Wrote ${path.relative(process.cwd(), target)}`);
