const SKILL_DELIMITER = 'EOF_GENERATIVE_UI';

/** Where OpenCode, Claude Code and the agent read the `generative-ui` skill from inside the image. */
const SKILL_PATH = '/root/.config/opencode/skills/generative-ui/SKILL.md';

/**
 * The agent's Containerfile: the hand-written `base` plus the generated `generative-ui` skill as a heredoc `COPY`. The
 * image is built from one text with no build context, so the skill travels inside it, and the image tag, a hash of this
 * text, changes with the skill.
 */
export function buildAgentContainerfile(base: string, skill: string): string {
    if (skill.split('\n').includes(SKILL_DELIMITER)) {
        throw new Error(`The generative-ui skill contains the heredoc delimiter line ${SKILL_DELIMITER}`);
    }

    return `${base}COPY <<'${SKILL_DELIMITER}' ${SKILL_PATH}\n${skill}\n${SKILL_DELIMITER}\n`;
}
