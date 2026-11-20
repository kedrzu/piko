import { APP_LANGUAGES } from '@piko/common/appLanguages.js';
import type { AppLanguage } from '@piko/common/appLanguages.js';
import type { PluginError, PluginLevel, PluginMarketplaceText } from '@piko/common/api/PluginTypes.js';

/** A plugin's `plugin.json`, validated. Fields the daemon does not know are dropped. */
export interface PluginManifest {
    name: string;
    level: PluginLevel;
    tags: string[];
    marketplace: Record<AppLanguage, PluginMarketplaceText>;
    /** The name of one of the plugin's skills, which the agent runs when the plugin is installed. */
    onboarding?: string;
    environment?: PluginEnvironment;
}

/** What the plugin needs in the agent's environment. Versions are exact, so every install gets the same code. */
export interface PluginEnvironment {
    /** A Bun package inside the plugin's folder: a relative path with `/` between folders, never leaving the folder. */
    cli?: string;
    /** npm package name → exact version. */
    npm?: Record<string, string>;
    /** Python package name → exact version. */
    python?: Record<string, string>;
}

/** How parsing a `plugin.json` ended: the manifest, or every invalid field. */
export type PluginManifestParseResult = { manifest: PluginManifest } | { errors: PluginError[] };

/** A plugin's and a skill's name: lowercase words joined by single hyphens (`email-sorting`). */
export const PLUGIN_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** An npm package name, optionally scoped; never starting with `-` or `.`, so it cannot read as an option or a path. */
const NPM_PACKAGE_PATTERN = /^(@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/;
/** An exact semver version: `1.2.3`, `1.2.3-beta.1`; no ranges, tags or URLs. */
const NPM_VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
/** A Python distribution name (PEP 508). */
const PYTHON_PACKAGE_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/;
/** An exact PEP 440 version: `2.31.0`, `1.0rc1`, `1.0.post1`; no specifiers. */
const PYTHON_VERSION_PATTERN = /^\d+(\.\d+)*((a|b|rc)\d+)?(\.post\d+)?(\.dev\d+)?$/;

/**
 * Validates a parsed `plugin.json`, which for an own plugin is anything the person or the agent wrote. Every invalid
 * field is reported, not only the first.
 * @__NO_SIDE_EFFECTS__
 */
export function parsePluginManifest(value: unknown): PluginManifestParseResult {
    if (!isRecord(value)) {
        return { errors: [{ code: 'invalidField', field: '' }] };
    }

    const errors: PluginError[] = [];

    const name = parseName(value.name);
    if (name == null) {
        invalid('name');
    }
    const level = value.level === 'profile' || value.level === 'project' ? value.level : null;
    if (level == null) {
        invalid('level');
    }
    const tags = parseTags(value.tags);
    if (tags == null) {
        invalid('tags');
    }
    const marketplace = parseMarketplace(value.marketplace, invalid);
    const onboarding = value.onboarding === undefined ? undefined : parseName(value.onboarding);
    if (onboarding === null) {
        invalid('onboarding');
    }
    const environment = value.environment === undefined ? undefined : parseEnvironment(value.environment, invalid);

    if (errors.length > 0 || name == null || level == null || tags == null || marketplace == null) {
        return { errors };
    }
    return {
        manifest: {
            name,
            level,
            tags,
            marketplace,
            ...(onboarding != null && { onboarding }),
            ...(environment && { environment }),
        },
    };

    function invalid(field: string) {
        errors.push({ code: 'invalidField', field });
    }
}

/** @__NO_SIDE_EFFECTS__ */
function parseName(value: unknown) {
    return typeof value === 'string' && PLUGIN_NAME_PATTERN.test(value) ? value : null;
}

/** @__NO_SIDE_EFFECTS__ */
function parseTags(value: unknown) {
    if (!Array.isArray(value)) {
        return null;
    }
    const tags: string[] = [];
    for (const tag of value) {
        if (typeof tag !== 'string' || tag.trim().length === 0) {
            return null;
        }
        tags.push(tag);
    }
    return tags;
}

function parseMarketplace(value: unknown, invalid: (field: string) => void) {
    if (!isRecord(value)) {
        invalid('marketplace');
        return null;
    }
    const marketplace: Partial<Record<AppLanguage, PluginMarketplaceText>> = {};
    for (const language of APP_LANGUAGES) {
        const text = value[language];
        if (
            isRecord(text) &&
            typeof text.title === 'string' &&
            text.title.trim().length > 0 &&
            typeof text.description === 'string' &&
            text.description.trim().length > 0
        ) {
            marketplace[language] = { title: text.title, description: text.description };
        } else {
            invalid(`marketplace.${language}`);
        }
    }
    return isComplete(marketplace) ? marketplace : null;
}

function parseEnvironment(value: unknown, invalid: (field: string) => void) {
    if (!isRecord(value)) {
        invalid('environment');
        return undefined;
    }
    const environment: PluginEnvironment = {};
    if (value.cli !== undefined) {
        if (isInsidePath(value.cli)) {
            environment.cli = value.cli;
        } else {
            invalid('environment.cli');
        }
    }
    if (value.npm !== undefined) {
        environment.npm = parsePackages(value.npm, {
            field: 'environment.npm',
            name: NPM_PACKAGE_PATTERN,
            version: NPM_VERSION_PATTERN,
            invalid,
        });
    }
    if (value.python !== undefined) {
        environment.python = parsePackages(value.python, {
            field: 'environment.python',
            name: PYTHON_PACKAGE_PATTERN,
            version: PYTHON_VERSION_PATTERN,
            invalid,
        });
    }
    return environment;
}

interface ParsePackagesOptions {
    field: string;
    name: RegExp;
    version: RegExp;
    invalid: (field: string) => void;
}

function parsePackages(value: unknown, options: ParsePackagesOptions) {
    if (!isRecord(value)) {
        options.invalid(options.field);
        return {};
    }
    const packages: Record<string, string> = {};
    for (const [name, version] of Object.entries(value)) {
        if (options.name.test(name) && typeof version === 'string' && options.version.test(version)) {
            packages[name] = version;
        } else {
            options.invalid(`${options.field}.${name}`);
        }
    }
    return packages;
}

/**
 * Whether `value` is a relative path that stays inside the folder it is resolved against: folders joined by `/`, none
 * empty, `.` or `..`, no backslash or colon (a Windows separator or drive).
 * @__NO_SIDE_EFFECTS__
 */
function isInsidePath(value: unknown): value is string {
    if (typeof value !== 'string' || value.length === 0 || /[\\:\p{Cc}]/u.test(value)) {
        return false;
    }
    return value.split('/').every(segment => segment.length > 0 && segment !== '.' && segment !== '..');
}

/** @__NO_SIDE_EFFECTS__ */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @__NO_SIDE_EFFECTS__ */
function isComplete(
    marketplace: Partial<Record<AppLanguage, PluginMarketplaceText>>,
): marketplace is Record<AppLanguage, PluginMarketplaceText> {
    return APP_LANGUAGES.every(language => marketplace[language] !== undefined);
}
