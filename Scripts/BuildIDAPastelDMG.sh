#!/bin/bash
set -euo pipefail

app_path="${1:?usage: BuildIDAPastelDMG.sh /Applications/IDAPastel.app dist}"
output_dir="${2:?usage: BuildIDAPastelDMG.sh /Applications/IDAPastel.app dist}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
info_plist="$app_path/Contents/Info.plist"

test -d "$app_path"
test -f "$info_plist"
"$script_dir/VerifyIDAPastelApp.sh" "$app_path"

version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$info_plist")
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/idapastel-dmg.XXXXXX")
stage_dir="$work_dir/stage"

cleanup() {
    rm -rf "$work_dir"
}
trap cleanup EXIT

mkdir -p "$stage_dir" "$output_dir"
cp -R "$app_path" "$stage_dir/IDAPastel.app"
ln -s /Applications "$stage_dir/Applications"

dmg_name="IDAPastel-${version}-arm64.dmg"
dmg_path="$output_dir/$dmg_name"
hdiutil create -volname IDAPastel -srcfolder "$stage_dir" -ov -format UDZO "$dmg_path"
(
    cd "$output_dir"
    shasum -a 256 "$dmg_name" > "$dmg_name.sha256"
)
