#!/bin/bash
set -euo pipefail

dmg_path="${1:?usage: VerifyIDAPastelDMG.sh dist/IDAPastel.dmg}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mount_dir=$(mktemp -d "${TMPDIR:-/tmp}/idapastel-mount.XXXXXX")

test -f "$dmg_path"
test -f "$dmg_path.sha256"

cleanup() {
    hdiutil detach "$mount_dir" -quiet >/dev/null 2>&1 || true
    rmdir "$mount_dir" >/dev/null 2>&1 || true
}
trap cleanup EXIT

hdiutil attach "$dmg_path" -readonly -nobrowse -mountpoint "$mount_dir" -quiet
test -L "$mount_dir/Applications"
test "$(readlink "$mount_dir/Applications")" = "/Applications"
"$script_dir/VerifyIDAPastelApp.sh" "$mount_dir/IDAPastel.app"
(
    cd "$(dirname "$dmg_path")"
    shasum -a 256 -c "$(basename "$dmg_path").sha256"
)
