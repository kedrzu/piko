import { execFileSync } from 'node:child_process';
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { composeUpdaterManifest, developmentVersion, hasNoCode } from './releasePlan.js';

// The release CLI that CI runs with plain bun, without `bun install`:
//   release.ts development-plan --files <file>
//     <file> is the changed paths since the published build, the output of `git diff -z --name-only --no-renames`.
//     Outputs `version=<version>` of the Development build, and `build=true|false`, false only when the changed paths
//     are all documentation.
//   release.ts updater-manifest --version <version> --download-url <url> --assets <file> --signatures <dir> --out <file>
//     <file> is the release's assets as GitHub lists them, <dir> holds its `.sig` files. Writes `latest.json` to --out.
// It reads local git, its arguments and the files it is given only. Git is spawned with an argument array, never through
// a shell.

const USAGE =
    'usage: release.ts development-plan --files <file> | updater-manifest --version <version> --download-url <url> --assets <file> --signatures <dir> --out <file>';

if (import.meta.main) {
    main(process.argv.slice(2));
}

function main(args: string[]) {
    const [command, ...rest] = args;
    if (command === 'development-plan') {
        developmentPlan(rest);
    } else if (command === 'updater-manifest') {
        updaterManifest(rest);
    } else {
        fail(USAGE);
    }
}

function developmentPlan(args: string[]) {
    const files = readFiles(args);
    const tags = git('tag', '-l', 'v*', '--merged', 'HEAD');
    const [count] = git('rev-list', '--count', 'HEAD');
    const version = developmentVersion({ tags, commitCount: Number(count) });
    const build = !hasNoCode(files);

    report(
        build
            ? `Development build ${version}`
            : 'No Development build: only documentation changed since the published build.',
    );
    if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nbuild=${build}\n`);
    }
}

function updaterManifest(args: string[]) {
    const version = option(args, '--version');
    const downloadUrl = option(args, '--download-url');
    const assetsFile = option(args, '--assets');
    const signaturesDir = option(args, '--signatures');
    const out = option(args, '--out');
    if (!version || !downloadUrl || !assetsFile || !signaturesDir || !out) {
        fail(USAGE);
    }

    const assetNames = readAssetNames(assetsFile);
    const signatures = Object.fromEntries(
        readdirSync(signaturesDir).map(name => [name, readFileSync(path.join(signaturesDir, name), 'utf8')]),
    );
    const result = composeUpdaterManifest({
        version,
        pubDate: new Date().toISOString(),
        downloadUrl,
        assets: assetNames,
        signatures,
    });
    if (!result.valid) {
        fail(result.reason);
    }
    writeFileSync(out, JSON.stringify(result.manifest, null, 2));
}

function readAssetNames(assetsFile: string): string[] {
    const assets: unknown = JSON.parse(readFileSync(assetsFile, 'utf8'));
    if (!Array.isArray(assets)) {
        return fail(`${assetsFile} is not a list of assets`);
    }
    return assets.map((asset: unknown) => {
        if (typeof asset !== 'object' || asset === null || !('name' in asset) || typeof asset.name !== 'string') {
            return fail(`${assetsFile} holds an asset with no name`);
        }
        return asset.name;
    });
}

function readFiles(args: string[]): string[] {
    const listFile = option(args, '--files');
    // A list that was lost must not read as an empty one, which passes.
    if (!listFile) {
        fail(USAGE);
    }
    return readFileSync(listFile, 'utf8')
        .split('\0')
        .filter(file => file !== '');
}

function option(args: string[], name: string): string | undefined {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
}

function git(...args: string[]): string[] {
    const output = execFileSync('git', args, { encoding: 'utf8' });
    return output.split('\n').filter(line => line !== '');
}

/** Prints the outcome, and shows it on the run's summary page too. */
function report(text: string) {
    console.info(text);
    if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
    }
}

/** One line in the form GitHub Actions reports as an error, and a non-zero exit. */
function fail(message: string): never {
    console.info(`::error::${message}`);
    process.exit(1);
}
