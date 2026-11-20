# Releasing the desktop app

The desktop app (`packages/desktop`) has one release stream so far, **Development**: every push to `main` that passes
the checks and changes more than documentation builds a signed Mac app and replaces the one `Development` prerelease on
GitHub. Installed apps update themselves from it. Stable releases, a stream switch and a changelog come later. The
design is githq's (`kedrzu/githq`, `docs/design/desktop-releases/`), copied and cut to one platform and one stream.

## The Development stream

`.github/workflows/development.yml` runs after the `Build` workflow succeeds on a push to `main`
(`.github/workflows/build.yml`), unless only documentation changed since the published build: `docs/**`, `.claude/**`,
`*.md` and `*.pen` (`scripts/releasePlan.ts`, `hasNoCode`). It builds macOS Apple Silicon
(`.github/workflows/desktop-build.yml`) into a draft under the tag `development`, checks the draft's `latest.json`, then
deletes the published release and publishes the draft. The tag never moves; the release's description names the
commit. Nothing here is done by hand.

The version is the last stable version with its minor raised, plus the commit count on `main`: `0.1.0-dev.N` while there
is no stable tag. CI writes it into `tauri.conf.json` before building; the committed `version` there is for local
builds only.

The release holds `poweragents_<version>_aarch64.dmg` (to install by hand), `poweragents_aarch64.app.tar.gz` and its
`.sig` (the updater bundle), and `latest.json`, whose download URLs carry `?v=<version>`: for about 100 s after a
replacement GitHub's CDN still serves the old file at the plain URL, which would fail the new signature.

A failed build leaves the last published one in place, and the next run builds everything since it. A newer build
cancels an older one, and the draft it left is removed by the next run. A run never publishes a commit older than the
published build. To retry a failed run, use "Re-run failed jobs".

## What the installed app does

- **Updates.** The app reads `releases/download/development/latest.json?t=<seconds>` at launch and every 5 minutes,
  downloads a newer build in the background, verifies its signature against `plugins.updater.pubkey` and installs it in
  place (`src-tauri/src/updater.rs`). A toast then offers a restart; nothing restarts on its own, and quitting and
  reopening also starts the new version. Once an update is ready, timed checks stop until the restart. If the install
  fails (the app sits where only an administrator may replace it, and the prompt was refused), the toast offers Try
  again.
- **The daemon.** The daemon outlives the app, so after an update the old one would keep serving the new app. At
  launch the app asks the daemon on its port for its version (`/status`): one that reports a different version is sent
  SIGTERM, and once the port is free the app starts its own (`src-tauri/src/daemon.rs`;
  [decision](../decisions/daemon-handover-on-app-update.md)). The daemon exits without stopping the sandbox: the VM and
  the agent's container keep running, and the new daemon reattaches to them, so a conversation in progress goes on.
  - When the new version changes the agent's container (its image or run options), the new daemon recreates it and
    the turn in progress is cut. Accepted: it happens only when the image changes, after a restart the person chose.
  - A daemon run from a worktree reports no version and is never touched. Neither is a daemon left by a build from
    before versions were reported; stop it once by hand: `lsof -nP -iTCP:47610 -sTCP:LISTEN -t | xargs kill`.
  - Not yet verified on a real update: that replacing the `.app` on disk leaves the running daemon and Lima's host agent
    alive. If the host agent dies with it, the new daemon starts the VM again (about 14 s) and the turn is cut. Check it
    on the first real update and correct this line.

## Signing

Every executable in the bundle is signed with hardened runtime, which notarization requires:

- the app and the daemon sidecar, by Tauri, with `src-tauri/Entitlements.plist`: the five entitlements a Bun-compiled
  executable needs for its JavaScript engine (Bun's guide "Codesign a single-file JavaScript executable on macOS");
- Lima's `limactl`, by `scripts/signLima.sh` before bundling, with `src-tauri/lima.entitlements`
  (`com.apple.security.virtualization`, which Lima's `vz` VM needs). Tauri does not sign bundle resources, and
  `limactl` is one.

`scripts/checkDesktopBundle.sh <app> <version> [--notarized]` fails the build unless every signature verifies, each
executable has hardened runtime, `limactl` keeps its entitlement, the bundled daemon starts from inside the app and
answers `/status` with the version, and `limactl` runs; `--notarized` adds Gatekeeper's assessment and the stapled
ticket.

Without the Apple secrets the build is ad-hoc signed (`bundle.macOS.signingIdentity: "-"`): it still publishes and
updates, but a downloaded `.dmg` opens only after `xattr -dr com.apple.quarantine /Applications/poweragents.app`.

## Local builds

- `bun run desktop` — the app in a window against `nuxt dev`; the daemon runs from source. The updater is off.
- `bun --cwd packages/desktop tauri build --bundles app` — a local, ad-hoc signed app under
  `packages/desktop/src-tauri/target/release/bundle/macos/`. It needs no key: the updater bundle is switched on only in
  CI. Run `scripts/signLima.sh -` first and `scripts/checkDesktopBundle.sh <app> 0.1.0` after, as CI does.

## Secrets

Every secret lives in the secret store (`bun poweragents secrets`, declared in `packages/cli/src/secrets.ts`), under the prefix
`POWERAGENTS_PROD_`, read only with `POWERAGENTS_ENV=prod`, so `bun run dev` never holds them. The store is the only
readable copy: GitHub secrets can't be read back. The workflows read the repository secrets of the same names, copied
from the store. Log in once per machine with `bun poweragents secrets login`.

### Updater key

The updater bundle is signed with a minisign key. Its public half is `plugins.updater.pubkey` in
`packages/desktop/src-tauri/tauri.conf.json`. **If the private key is lost, installed apps can never update again**:
they accept only updates signed by this key, and every install would have to be replaced by hand.

Made once, in the owner's own terminal, so neither value passes through an agent:

```sh
KEYDIR=$(mktemp -d)
bun --cwd packages/desktop tauri signer generate -w "$KEYDIR/updater.key"   # asks for the key's password
POWERAGENTS_ENV=prod bun poweragents secrets set TAURI_SIGNING_PRIVATE_KEY < "$KEYDIR/updater.key"
POWERAGENTS_ENV=prod bun poweragents secrets set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --prompt="The updater key's password"
cat "$KEYDIR/updater.key.pub"   # goes into plugins.updater.pubkey
rm -rf "$KEYDIR"
```

Then the repository secrets, from the store (also to replace them):

```sh
POWERAGENTS_ENV=prod bun poweragents secrets run TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD -- sh -c '
  printf %s "$TAURI_SIGNING_PRIVATE_KEY" | gh secret set TAURI_SIGNING_PRIVATE_KEY
  printf %s "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD" | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD'
```

### Apple signing and notarization

Without these the app is ad-hoc signed (above). With them, the build signs with the Developer ID and notarizes. Tauri's
guide: [macOS code signing](https://v2.tauri.app/distribute/sign/macos/).

1. In the Apple Developer Program, as the Account Holder, create a **Developer ID Application** certificate from a
   certificate signing request made in Keychain Access, and open the downloaded `.cer` to install it.

2. Export it from Keychain Access (My Certificates) as a `.p12` with a password.

3. Put everything in the store:

   ```sh
   base64 -i certificate.p12 | POWERAGENTS_ENV=prod bun poweragents secrets set APPLE_CERTIFICATE
   POWERAGENTS_ENV=prod bun poweragents secrets set APPLE_CERTIFICATE_PASSWORD --prompt="The .p12's export password"
   POWERAGENTS_ENV=prod bun poweragents secrets set APPLE_SIGNING_IDENTITY --prompt="Developer ID Application: Name (TEAMID)"
   POWERAGENTS_ENV=prod bun poweragents secrets set APPLE_ID --prompt="The Apple Account's email"
   POWERAGENTS_ENV=prod bun poweragents secrets set APPLE_PASSWORD --prompt="An app-specific password from account.apple.com"
   POWERAGENTS_ENV=prod bun poweragents secrets set APPLE_TEAM_ID --prompt="The team ID, developer.apple.com → Membership"
   ```

4. Copy them to the repository secrets:

   ```sh
   POWERAGENTS_ENV=prod bun poweragents secrets run APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY \
     APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID -- sh -c '
     printf %s "$APPLE_CERTIFICATE" | gh secret set APPLE_CERTIFICATE
     printf %s "$APPLE_CERTIFICATE_PASSWORD" | gh secret set APPLE_CERTIFICATE_PASSWORD
     printf %s "$APPLE_SIGNING_IDENTITY" | gh secret set APPLE_SIGNING_IDENTITY
     printf %s "$APPLE_ID" | gh secret set APPLE_ID
     printf %s "$APPLE_PASSWORD" | gh secret set APPLE_PASSWORD
     printf %s "$APPLE_TEAM_ID" | gh secret set APPLE_TEAM_ID'
   ```

5. Check the next Development build: its "Check the bundle" step runs with `--notarized`, and the `.dmg` opens without
   a warning. The first notarization of an account can take much longer than later ones (githq's took 41 minutes).

The workflow exports each Apple secret only when it is set: an empty `APPLE_CERTIFICATE` would fail the bundle.
`APPLE_CERTIFICATE` without `APPLE_SIGNING_IDENTITY` fails the build on purpose, since Lima would otherwise stay ad-hoc
signed inside a Developer ID app and notarization would reject it.
