#!/bin/bash
set -euo pipefail

app_path="${1:?usage: VerifyIDAPastelApp.sh /Applications/IDAPastel.app}"
while [[ "$app_path" != "/" && "$app_path" == */ ]]; do
    app_path="${app_path%/}"
done
info_plist="$app_path/Contents/Info.plist"

reject_direct_symlink() {
    local candidate="$1"
    if test -L "$candidate"; then
        echo "Symbolic link not allowed: $candidate" >&2
        exit 1
    fi
}

require_adhoc_signature() {
    local executable_path="$1"
    local signing_details

    signing_details=$(codesign -dvvv "$executable_path" 2>&1)
    printf '%s\n' "$signing_details" | grep -qx 'Signature=adhoc'
    printf '%s\n' "$signing_details" | grep -qx 'TeamIdentifier=not set'
    printf '%s\n' "$signing_details" | grep -Eq '^CodeDirectory .*flags=.*\(adhoc\)'

    if printf '%s\n' "$signing_details" | grep -q '^Authority='; then
        echo "Developer certificate authority must be absent: $executable_path" >&2
        exit 1
    fi

    if printf '%s\n' "$signing_details" | grep -Eq '^CodeDirectory .*flags=.*runtime'; then
        echo "Hardened runtime must be absent: $executable_path" >&2
        exit 1
    fi
}

require_arm64_macho() {
    local executable_path="$1"
    local file_details

    file_details=$(file -b "$executable_path")
    if ! printf '%s\n' "$file_details" | grep -Eq '^Mach-O .* arm64$'; then
        echo "Expected arm64 Mach-O executable: $executable_path" >&2
        exit 1
    fi
}

reject_direct_symlink "$app_path"
test -d "$app_path"
reject_direct_symlink "$info_plist"
test -f "$info_plist"

bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$info_plist")
bundle_name=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$info_plist")
executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$info_plist")

test "$bundle_id" = "com.idapastel.app"
test "$bundle_name" = "IDAPastel"
test "$executable" = "IDAPastel"

main_executable="$app_path/Contents/MacOS/$executable"
node_executable="$app_path/Contents/Resources/node/bin/node"
sap_signer="$app_path/Contents/Resources/sap-signer"

reject_direct_symlink "$main_executable"
reject_direct_symlink "$node_executable"
reject_direct_symlink "$sap_signer"
test -f "$main_executable"
test -f "$node_executable"
test -f "$sap_signer"
test -x "$main_executable"
test -x "$node_executable"
test -x "$sap_signer"

require_arm64_macho "$main_executable"
require_arm64_macho "$node_executable"
require_arm64_macho "$sap_signer"
codesign --verify --deep --strict --verbose=2 "$app_path"
require_adhoc_signature "$app_path"
require_adhoc_signature "$main_executable"
require_adhoc_signature "$node_executable"
require_adhoc_signature "$sap_signer"

if /usr/libexec/PlistBuddy -c 'Print :SUFeedURL' "$info_plist" >/dev/null 2>&1; then
    echo 'SUFeedURL must be absent for IDAPastel' >&2
    exit 1
fi
