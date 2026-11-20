/**
 * Every secret the repo uses. All of them sign a release, so they apply only under `PIKO_ENV=prod`: `dev`
 * holds none, so `bun run dev` never holds what signs updates and the app.
 */
import type { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { defineSecret } from '@nzyme/secrets/defineSecret.js';

function isProd(env: EnvVariables): boolean {
    return env.PIKO_ENV === 'prod';
}

export const TAURI_SIGNING_PRIVATE_KEY = defineSecret('TAURI_SIGNING_PRIVATE_KEY', {
    description: 'The updater signing key that signs the update artifacts',
    enabled: isProd,
});
export const TAURI_SIGNING_PRIVATE_KEY_PASSWORD = defineSecret('TAURI_SIGNING_PRIVATE_KEY_PASSWORD', {
    description: "The updater signing key's password",
    enabled: isProd,
});
export const APPLE_CERTIFICATE = defineSecret('APPLE_CERTIFICATE', {
    description: 'The Developer ID Application certificate, a base64 .p12',
    enabled: isProd,
});
export const APPLE_CERTIFICATE_PASSWORD = defineSecret('APPLE_CERTIFICATE_PASSWORD', {
    description: "The .p12's export password",
    enabled: isProd,
});
export const APPLE_SIGNING_IDENTITY = defineSecret('APPLE_SIGNING_IDENTITY', {
    description: 'The signing identity, "Developer ID Application: Name (TEAMID)"',
    enabled: isProd,
});
export const APPLE_ID = defineSecret('APPLE_ID', {
    description: 'The Apple Account email that notarizes the app',
    enabled: isProd,
});
export const APPLE_PASSWORD = defineSecret('APPLE_PASSWORD', {
    description: 'An app-specific password of the Apple Account, for notarization',
    enabled: isProd,
});
export const APPLE_TEAM_ID = defineSecret('APPLE_TEAM_ID', {
    description: 'The Apple developer team ID',
    enabled: isProd,
});
