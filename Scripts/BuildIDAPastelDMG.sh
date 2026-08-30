#!/bin/bash
set -euo pipefail

app_path="${1:?usage: BuildIDAPastelDMG.sh /Applications/IDAPastel.app dist}"
output_dir="${2:?usage: BuildIDAPastelDMG.sh /Applications/IDAPastel.app dist}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
info_plist="$app_path/Contents/Info.plist"

test -d "$app_path"
test -f "$info_plist"

version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$info_plist")
if [[ ! "$version" =~ ^[A-Za-z0-9._-]+$ || "$version" == *..* ]]; then
    echo "Unsafe CFBundleShortVersionString: $version" >&2
    exit 1
fi

mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd -P)"

dmg_name="IDAPastel-${version}-arm64.dmg"
dmg_path="$output_dir/$dmg_name"
checksum_path="$dmg_path.sha256"
case "$dmg_path" in
    "$output_dir"/*) ;;
    *)
        echo "DMG output must remain under: $output_dir" >&2
        exit 1
        ;;
esac

"$script_dir/VerifyIDAPastelApp.sh" "$app_path"

work_dir=$(mktemp -d "$output_dir/.idapastel-dmg.XXXXXX")
stage_dir="$work_dir/stage"
staged_dmg_path="$work_dir/$dmg_name"
staged_checksum_path="$work_dir/$dmg_name.sha256"

cleanup() {
    rm -rf "$work_dir"
}
trap cleanup EXIT

mkdir -p "$stage_dir"
cp -R "$app_path" "$stage_dir/IDAPastel.app"
ln -s /Applications "$stage_dir/Applications"

hdiutil create -volname IDAPastel -srcfolder "$stage_dir" -ov -format UDZO "$staged_dmg_path"
(
    cd "$work_dir"
    shasum -a 256 "$dmg_name" > "$dmg_name.sha256"
)

test -f "$staged_dmg_path"
test -f "$staged_checksum_path"
test ! -L "$staged_dmg_path"
test ! -L "$staged_checksum_path"
mv -f "$staged_checksum_path" "$checksum_path"
mv -f "$staged_dmg_path" "$dmg_path"
test ! -L "$dmg_path"
test ! -L "$checksum_path"
test -f "$dmg_path"
test -f "$checksum_path"
