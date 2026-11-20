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

// The `piko` command imported as text the same way (`sandbox/piko.js`): it runs inside the agent's image,
// never in the daemon. `sandbox/tsconfig.json` type-checks it.
declare module '*/piko.js' {
    const content: string;
    export default content;
}
