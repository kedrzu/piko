#!/usr/bin/env bash
# Checks a built macOS desktop bundle before it ships: usage
# `scripts/checkDesktopBundle.sh <path/to/piko.app> <expected version> [--notarized]`.
#
# Fails (non-zero, `::error::` lines for GitHub Actions) unless the signature is valid, every Mach-O has the hardened
# runtime, `limactl` kept its virtualization entitlement, and the daemon sidecar, started from the bundle, reports the
# expected version on `/status`. With `--notarized` it also checks Gatekeeper and the stapled ticket.
set -euo pipefail

app="${1:?usage: checkDesktopBundle.sh <app> <expected version> [--notarized]}"
version="${2:?usage: checkDesktopBundle.sh <app> <expected version> [--notarized]}"
notarized="${3:-}"

failed=0
fail() {
    echo "::error::$*"
    failed=1
}

daemon="$app/Contents/MacOS/piko-daemon"
limactl="$app/Contents/Resources/lima/bin/limactl"

[[ -d "$app" ]] || { echo "::error::$app is not a bundle"; exit 1; }

# The signature, covering every nested file.
codesign --verify --deep --strict "$app" || fail "codesign --verify failed for $app"

# The hardened runtime on every Mach-O: notarization rejects one without it. The output is captured first: `grep -q`
# closing the pipe early would fail `codesign` under `pipefail`.
has_hardened_runtime() {
    local details
    details="$(codesign -dv "$1" 2>&1)"
    grep -Eq 'flags=.*\(.*runtime.*\)' <<<"$details"
}
for binary in "$app"/Contents/MacOS/*; do
    [[ -f "$binary" ]] || continue
    has_hardened_runtime "$binary" || fail "${binary#"$app"/} is not signed with the hardened runtime"
done
has_hardened_runtime "$limactl" || fail "limactl is not signed with the hardened runtime"

# Re-signing replaces the entitlements: limactl needs virtualization to run the VM.
entitlements="$(codesign -d --entitlements - "$limactl" 2>&1)"
grep -q 'com.apple.security.virtualization' <<<"$entitlements" ||
    fail "limactl lost the com.apple.security.virtualization entitlement"
"$limactl" --version >/dev/null || fail "limactl --version does not run from the bundle"

# The sidecar answers `/status` with the version it was started for. Everything it writes goes under a temp folder
# (`HOME`, the data root, Lima's home). The daemon starts the sandbox on its own, so `PIKO_LIMA_DIR` points at a
# stub `limactl` that fails at once: no VM is created or downloaded on this machine, and the daemon keeps serving.
work="$(mktemp -d /tmp/pacheck.XXXXXX)"
daemon_pid=""
cleanup() {
    if [[ -n "$daemon_pid" ]]; then kill "$daemon_pid" 2>/dev/null || true; fi
    rm -rf "$work"
}
trap cleanup EXIT

mkdir -p "$work/home" "$work/stub/bin"
printf '#!/bin/sh\nexit 1\n' >"$work/stub/bin/limactl"
chmod +x "$work/stub/bin/limactl"

port="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
HOME="$work/home" \
    PIKO_DAEMON_PORT="$port" \
    PIKO_VERSION="$version" \
    PIKO_LIMA_DIR="$work/stub" \
    PIKO_DATA_ROOT="$work/home/Piko" \
    PIKO_LIMA_HOME="$work/home/.piko/lima" \
    "$daemon" >"$work/daemon.out" 2>&1 &
daemon_pid=$!

expected="{\"status\":\"ok\",\"version\":\"$version\"}"
actual=""
for _ in $(seq 1 40); do
    actual="$(curl -fsS --max-time 2 "http://127.0.0.1:$port/status" 2>/dev/null || true)"
    [[ -n "$actual" ]] && break
    sleep 0.5
done
if [[ "$actual" != "$expected" ]]; then
    fail "the daemon sidecar answered '$actual' on /status, expected '$expected'"
    tail -n 20 "$work/daemon.out" || true
fi

if [[ "$notarized" == "--notarized" ]]; then
    spctl --assess --type execute -vv "$app" || fail "Gatekeeper rejects $app"
    xcrun stapler validate "$app" || fail "$app has no stapled notarization ticket"
fi

exit "$failed"
