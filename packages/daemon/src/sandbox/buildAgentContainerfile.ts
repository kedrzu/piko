/** What the agent's Containerfile is built from. */
export interface BuildAgentContainerfileParams {
    /** The hand-written `agent.Containerfile`. */
    base: string;
    /** The generated `generative-ui` skill. */
    skill: string;
    /** The `piko` command (`sandbox/piko.js`), a Bun script. */
    cli: string;
}

/** Where OpenCode, Claude Code and the agent read the `generative-ui` skill from inside the image. */
const SKILL_PATH = '/root/.config/opencode/skills/generative-ui/SKILL.md';
/** Where the agent's shell finds the `piko` command; the image's Bun runs it by its shebang. */
const CLI_PATH = '/usr/local/bin/piko';

/**
 * The agent's Containerfile: the hand-written `base`, then the generated `generative-ui` skill and the `piko`
 * command as heredoc `COPY`s. The image is built from one text with no build context, so both travel inside it, and the
 * image tag, a hash of this text, changes with either.
 * @__NO_SIDE_EFFECTS__
 */
export function buildAgentContainerfile({ base, skill, cli }: BuildAgentContainerfileParams): string {
    return (
        base +
        copyHeredoc({ content: skill, delimiter: 'EOF_GENERATIVE_UI', target: SKILL_PATH }) +
        copyHeredoc({ content: cli, delimiter: 'EOF_PIKO_CLI', target: CLI_PATH }) +
        `RUN chmod 755 ${CLI_PATH}\n`
    );
}

/** A file written into the image by a heredoc `COPY`. */
interface CopyHeredocParams {
    content: string;
    delimiter: string;
    target: string;
}

/** @__NO_SIDE_EFFECTS__ */
function copyHeredoc({ content, delimiter, target }: CopyHeredocParams) {
    if (content.split('\n').includes(delimiter)) {
        throw new Error(`The content for ${target} contains the heredoc delimiter line ${delimiter}`);
    }
    // Quoted, so the builder expands nothing in the content.
    return `COPY <<'${delimiter}' ${target}\n${content}\n${delimiter}\n`;
}
