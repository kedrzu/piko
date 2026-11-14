#!/usr/bin/env bash
# Re-signs the Lima binary the desktop app bundles: usage `scripts/signLima.sh <identity>` (`-` is ad-hoc).
#
# Tauri signs the app and its sidecar but not bundle resources, and `limactl` is a resource. Notarization needs every
# Mach-O signed with the hardened runtime and a secure timestamp, and Lima's release ships `limactl` signed ad-hoc. The
# re-signing must carry `com.apple.security.virtualization` again: `--force` drops the old entitlements, and without
# it the VM (Apple's Virtualization framework, `vz`) cannot start. Run it before `tauri build`, which copies the file.
set -euo pipefail

identity="${1:?usage: signLima.sh <signing identity, or - for ad-hoc>}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
limactl="$root/packages/daemon/vendor/lima/bin/limactl"
entitlements="$root/packages/desktop/src-tauri/lima.entitlements"

# An ad-hoc signature has no certificate, so a timestamp server cannot stamp it: `--timestamp` fails with `-`.
timestamp=(--timestamp)
if [[ "$identity" == "-" ]]; then
    timestamp=()
fi

codesign --force --options runtime ${timestamp[@]+"${timestamp[@]}"} --entitlements "$entitlements" --sign "$identity" "$limactl"
codesign --verify --strict "$limactl"
echo "Signed $limactl"
