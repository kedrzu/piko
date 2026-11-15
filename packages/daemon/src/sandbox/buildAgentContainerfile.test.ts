import { expect, test } from 'bun:test';

import { buildAgentContainerfile } from './buildAgentContainerfile.js';

const SKILL = '---\nname: generative-ui\ndescription: Show choices.\n---\n\n# Generative UI\n';
const CLI = '#!/usr/bin/env bun\nconsole.log("plugins");\n';

test('appends the skill and the executable poweragents command as heredoc COPYs, after the base', () => {
    const containerfile = buildAgentContainerfile({ base: 'FROM debian\n', skill: SKILL, cli: CLI });

    expect(containerfile).toBe(
        'FROM debian\n' +
            `COPY <<'EOF_GENERATIVE_UI' /root/.config/opencode/skills/generative-ui/SKILL.md\n${SKILL}\nEOF_GENERATIVE_UI\n` +
            `COPY <<'EOF_POWERAGENTS_CLI' /usr/local/bin/poweragents\n${CLI}\nEOF_POWERAGENTS_CLI\n` +
            'RUN chmod 755 /usr/local/bin/poweragents\n',
    );
});

test('refuses a skill or a command that would end its heredoc early', () => {
    expect(() =>
        buildAgentContainerfile({ base: 'FROM debian\n', skill: 'a\nEOF_GENERATIVE_UI\nRUN evil', cli: CLI }),
    ).toThrow('EOF_GENERATIVE_UI');
    expect(() =>
        buildAgentContainerfile({ base: 'FROM debian\n', skill: SKILL, cli: 'a\nEOF_POWERAGENTS_CLI\nRUN evil' }),
    ).toThrow('EOF_POWERAGENTS_CLI');
});
