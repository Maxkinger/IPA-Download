#!/bin/bash
set -euo pipefail

dmg_path="${1:?usage: VerifyIDAPastelDMG.sh dist/IDAPastel.dmg}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mount_dir=$(mktemp -d "${TMPDIR:-/tmp}/idapastel-mount.XXXXXX")

cleanup() {
    hdiutil detach "$mount_dir" -quiet >/dev/null 2>&1 || true
    rmdir "$mount_dir" >/dev/null 2>&1 || true
}
trap cleanup EXIT

checksum_path="$dmg_path.sha256"
dmg_name="$(basename "$dmg_path")"

test -f "$dmg_path"
test -f "$checksum_path"

line_count=$(wc -l < "$checksum_path" | tr -d '[:space:]')
if test "$line_count" != '1'; then
    echo "Checksum sidecar must contain exactly one record: $checksum_path" >&2
    exit 1
fi

sidecar_record=$(< "$checksum_path")
if [[ "$sidecar_record" == *$'\n'* || ! "$sidecar_record" =~ ^([0-9a-f]{64})\ \ (.+)$ ]]; then
    echo "Malformed checksum sidecar: $checksum_path" >&2
    exit 1
fi

expected_digest="${BASH_REMATCH[1]}"
recorded_name="${BASH_REMATCH[2]}"
if test "$recorded_name" != "$dmg_name"; then
    echo "Checksum sidecar filename does not match DMG: $recorded_name" >&2
    exit 1
fi

actual_digest=$(shasum -a 256 "$dmg_path")
actual_digest="${actual_digest%% *}"
if test "$actual_digest" != "$expected_digest"; then
    echo "Checksum mismatch: $dmg_path" >&2
    exit 1
fi

hdiutil attach "$dmg_path" -readonly -nobrowse -mountpoint "$mount_dir" -quiet
test -L "$mount_dir/Applications"
test "$(readlink "$mount_dir/Applications")" = "/Applications"
"$script_dir/VerifyIDAPastelApp.sh" "$mount_dir/IDAPastel.app"
