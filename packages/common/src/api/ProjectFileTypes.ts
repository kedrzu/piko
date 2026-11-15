/** A folder of a project to list. */
export interface ProjectFileListInput {
    projectId: string;
    /** A folder inside the project's folder; without it (or empty), the project's folder itself. */
    path?: string;
}

/** A file of a project. */
export interface ProjectFileInput {
    projectId: string;
    /**
     * Relative to the project's folder, with `/` between folders: `notatki/plan.md`. Hidden entries and links are never
     * read or written.
     */
    path: string;
}

/** A new text for a project's text file. */
export interface ProjectFileWriteInput extends ProjectFileInput {
    content: string;
    /** The `version` of the text the person edited, as read: a file changed since is not overwritten. */
    version: string;
}

/** An entry of a project's folder. */
export interface ProjectFileEntry {
    name: string;
    /** Relative to the project's folder, to pass back as a folder to list or a file to read. */
    path: string;
    kind: 'folder' | 'file';
    /** Epoch ms of the last change. */
    updatedAt: number;
    /** In bytes; 0 for a folder. */
    size: number;
}

/** How listing a project's folder ended. */
export type ProjectFileListResult =
    /** Folders first, then files, each by name. */
    | { entries: ProjectFileEntry[] }
    /**
     * No such project, or no such folder in it: also a path leading out of the project's folder, to a hidden folder or
     * through a link, which is never followed.
     */
    | { notFound: true };

/** A text file's content with what identifies it, for a later write. */
export interface ProjectTextFile {
    content: string;
    /** The SHA-256 of the file's bytes, in hex: a write given an older one is refused as stale. */
    version: string;
    /** Epoch ms of the last change. */
    updatedAt: number;
}

/** A file the daemon does not read as text: the app shows it by its content or its location. */
export interface ProjectBinaryFile {
    /** In bytes. */
    size: number;
    /** Epoch ms of the last change. */
    updatedAt: number;
}

/** How reading a project's file ended. */
export type ProjectFileReadResult =
    /** A `.md`, `.markdown`, `.txt` or `.csv` file of valid UTF-8 without a NUL byte, up to 1 MiB. */
    | { text: ProjectTextFile }
    /** Any other file, also one with a text extension that is not valid UTF-8 or holds a NUL byte. */
    | { binary: ProjectBinaryFile }
    /** A text file over 1 MiB. */
    | { tooLarge: true }
    /**
     * No such project, or no regular file at that path in it: also a path leading out of the project's folder, to a
     * hidden entry or through a link, which is never followed.
     */
    | { notFound: true };

/** How reading a project's file as bytes ended. */
export type ProjectFileContentResult =
    | {
          /** The file's bytes. */
          base64: string;
          /** In bytes. */
          size: number;
      }
    /** A file over 25 MiB. */
    | { tooLarge: true }
    /** Under the same rules as reading a file. */
    | { notFound: true };

/** How locating a project's file ended. */
export type ProjectFileLocateResult =
    /** The file's absolute path on the computer the daemon runs on. */
    | { path: string }
    /** Under the same rules as reading a file. */
    | { notFound: true };

/** How writing a project's text file ended. */
export type ProjectFileWriteResult =
    | { written: Omit<ProjectTextFile, 'content'> }
    /** The file changed since the given version was read: not written; its current text instead. */
    | { stale: ProjectTextFile }
    /** The content is over 1 MiB, the largest text file read: not written. */
    | { tooLarge: true }
    /**
     * No such project, or no text file at that path in it (a write never creates one), under the same rules as reading
     * a file.
     */
    | { notFound: true };

/** How opening a project's file in its default app ended. */
export type ProjectFileOpenResult =
    | { opened: true }
    /** Under the same rules as reading a file. */
    | { notFound: true }
    /** Not a document (`isOpenableFile`): an app, a script or an installer would run outside the sandbox. */
    | { notOpenable: true }
    /** The daemon cannot open files on this system yet. */
    | { unsupported: true };

/** The result of `files/release`. */
export interface ProjectFileReleaseResult {
    /** `false` when the agent was not holding a change to the file. */
    released: boolean;
}
