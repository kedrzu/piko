// The release rules of the desktop app's Development stream, pure: the version of a build, whether a change list needs a
// build at all, and the updater's manifest composed from a release's files. CI runs this with bun and without
// `bun install`, so it imports nothing.

const STABLE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
// The updater bundle Tauri names `<anything><ending>` and the platform the manifest lists it under.
const UPDATER_BUNDLES = [{ ending: '_aarch64.app.tar.gz', platform: 'darwin-aarch64' }];
const SIGNATURE_SUFFIX = '.sig';

export interface DevelopmentVersionParams {
    /** The `v*` tags merged into HEAD. */
    tags: string[];
    /** The number of commits reachable from HEAD. */
    commitCount: number;
}

export interface ComposeUpdaterManifestParams {
    version: string;
    /** When the manifest was written, as RFC 3339. */
    pubDate: string;
    /** Where the release's files download from, without the trailing slash. */
    downloadUrl: string;
    /** The names of every file on the release. */
    assets: string[];
    /** The content of each `.sig` file on the release, by its name. */
    signatures: Record<string, string>;
}

export interface UpdaterManifest {
    version: string;
    notes: string;
    pub_date: string;
    platforms: Record<string, { signature: string; url: string }>;
}

export type UpdaterManifestResult = { valid: true; manifest: UpdaterManifest } | { valid: false; reason: string };

interface Version {
    major: number;
    minor: number;
    patch: number;
}

/**
 * The version of a Development build, without the `v`: the next minor after the last stable tag, plus `-dev.N` with N
 * the commit count of HEAD. It sorts above the last stable and below the next minor, and reads no commit title.
 */
export function developmentVersion({ tags, commitCount }: DevelopmentVersionParams): string {
    const lastStable = findLastStableTag(tags);
    const last = lastStable ? parseStableTag(lastStable) : undefined;
    const { major, minor } = last ?? { major: 0, minor: 0 };
    return `${major}.${minor + 1}.0-dev.${commitCount}`;
}

/** The highest stable tag (exact `vX.Y.Z`, compared numerically), or undefined before the first release. */
export function findLastStableTag(tags: string[]): string | undefined {
    let last: { tag: string; version: Version } | undefined;
    for (const tag of tags) {
        const version = parseStableTag(tag);
        if (version && (!last || compareVersions(version, last.version) > 0)) {
            last = { tag, version };
        }
    }
    return last?.tag;
}

/**
 * Says whether a change list is only documentation, design and agent files. An empty list is a list we know nothing
 * about, so it is not: it builds.
 */
export function hasNoCode(files: string[]): boolean {
    return files.length > 0 && !files.some(isCodePath);
}

/**
 * The updater's `latest.json` from what a release's builds uploaded. A signature it cannot place is an error rather than
 * a platform left out, because an app on that platform would never update and nothing would say why.
 */
export function composeUpdaterManifest({
    version,
    pubDate,
    downloadUrl,
    assets,
    signatures,
}: ComposeUpdaterManifestParams): UpdaterManifestResult {
    const platforms: UpdaterManifest['platforms'] = {};
    for (const [signatureName, signature] of Object.entries(signatures)) {
        const name = signatureName.slice(0, -SIGNATURE_SUFFIX.length);
        const bundle = UPDATER_BUNDLES.find(({ ending }) => name.endsWith(ending));
        if (!bundle) {
            return { valid: false, reason: `${signatureName} signs no updater bundle this release knows` };
        }
        if (!assets.includes(name)) {
            return { valid: false, reason: `the release has ${signatureName} but no ${name}` };
        }
        platforms[bundle.platform] = { signature, url: `${downloadUrl}/${name}` };
    }
    return { valid: true, manifest: { version, notes: '', pub_date: pubDate, platforms } };
}

function isCodePath(file: string): boolean {
    return !file.endsWith('.md') && !file.endsWith('.pen') && !file.startsWith('docs/') && !file.startsWith('.claude/');
}

function parseStableTag(tag: string): Version | undefined {
    const match = STABLE_TAG.exec(tag);
    if (!match) {
        return undefined;
    }
    const [, major, minor, patch] = match.map(Number);
    if (major === undefined || minor === undefined || patch === undefined) {
        return undefined;
    }
    return { major, minor, patch };
}

function compareVersions(a: Version, b: Version): number {
    return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}
