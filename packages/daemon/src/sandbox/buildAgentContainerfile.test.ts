import { expect, test } from 'bun:test';

import { buildAgentContainerfile } from './buildAgentContainerfile.js';

test('appends the skill as a heredoc COPY into the skills directory, after the base', () => {
    const skill = '---\nname: generative-ui\ndescription: Show choices.\n---\n\n# Generative UI\n';

    const containerfile = buildAgentContainerfile('FROM debian\n', skill);

    expect(containerfile).toBe(
        `FROM debian\nCOPY <<'EOF_GENERATIVE_UI' /root/.config/opencode/skills/generative-ui/SKILL.md\n${skill}\nEOF_GENERATIVE_UI\n`,
    );
});

test('refuses a skill that would end the heredoc early', () => {
    expect(() => buildAgentContainerfile('FROM debian\n', 'a\nEOF_GENERATIVE_UI\nRUN evil')).toThrow(
        'EOF_GENERATIVE_UI',
    );
});
