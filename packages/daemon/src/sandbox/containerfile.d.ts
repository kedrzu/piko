// A Containerfile imported as text (`with { type: 'text' }`): Bun inlines it, so a compiled daemon carries it.
declare module '*.Containerfile' {
    const content: string;
    export default content;
}

// A generated Markdown file imported as text the same way (`generative-ui.skill.gen.md`).
declare module '*.gen.md' {
    const content: string;
    export default content;
}

// The `poweragents` command imported as text the same way (`sandbox/poweragents.js`): it runs inside the agent's image,
// never in the daemon. `sandbox/tsconfig.json` type-checks it.
declare module '*/poweragents.js' {
    const content: string;
    export default content;
}
