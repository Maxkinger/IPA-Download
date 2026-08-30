#!/bin/bash
set -euo pipefail

app_path="${1:?usage: VerifyIDAPastelApp.sh /Applications/IDAPastel.app}"
info_plist="$app_path/Contents/Info.plist"

test -d "$app_path"
test -f "$info_plist"

bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$info_plist")
bundle_name=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$info_plist")
executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$info_plist")

test "$bundle_id" = "com.idapastel.app"
test "$bundle_name" = "IDAPastel"
test "$executable" = "IDAPastel"

file "$app_path/Contents/MacOS/$executable" | grep -q 'arm64'
file "$app_path/Contents/Resources/node/bin/node" | grep -q 'arm64'
file "$app_path/Contents/Resources/sap-signer" | grep -q 'arm64'
codesign --verify --deep --strict --verbose=2 "$app_path"

if /usr/libexec/PlistBuddy -c 'Print :SUFeedURL' "$info_plist" >/dev/null 2>&1; then
    echo 'SUFeedURL must be absent for IDAPastel' >&2
    exit 1
fi
