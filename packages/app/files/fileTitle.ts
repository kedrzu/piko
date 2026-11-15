/**
 * How a project file is named to the person: its name without the folders, and without the extension for Markdown,
 * which reads as a note (`notes/Post ideas.md` is "Post ideas", `cover-draft-3.png` stays as it is).
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function fileTitle(path: string): string {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const markdown = /^(.+)\.(md|markdown)$/i.exec(name);
    return markdown?.[1] ?? name;
}
