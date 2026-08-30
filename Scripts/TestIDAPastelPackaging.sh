#!/bin/bash
set -euo pipefail

if test "$(basename "$0")" = "cp"; then
    /bin/cp "$@"
    copied_app="${!#}"
    staged_main="$copied_app/Contents/MacOS/IDAPastel"
    mv "$staged_main" "$staged_main.real"
    ln -s "IDAPastel.real" "$staged_main"
    exit 0
fi

app_path="${1:?usage: TestIDAPastelPackaging.sh IDAPastel.app IDAPastel.dmg}"
dmg_path="${2:?usage: TestIDAPastelPackaging.sh IDAPastel.app IDAPastel.dmg}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/idapastel-packaging-test.XXXXXX")

cleanup() {
    rm -rf "$work_dir"
}
trap cleanup EXIT

expect_symlink_rejection() {
    local label="$1"
    local expected_message="$2"
    shift 2
    local output
    local status

    set +e
    output=$("$@" 2>&1)
    status=$?
    set -e
    if test "$status" -eq 0; then
        echo "Expected rejection: $label" >&2
        exit 1
    fi
    if [[ "$output" != *"$expected_message"* ]]; then
        echo "Wrong rejection for $label" >&2
        printf '%s\n' "$output" >&2
        exit 1
    fi
    printf 'PASS %s\n' "$label"
}

"$script_dir/VerifyIDAPastelApp.sh" "$app_path"
"$script_dir/VerifyIDAPastelDMG.sh" "$dmg_path"
printf 'PASS real app and DMG\n'

linked_app="$work_dir/IDAPastel.app"
ln -s "$app_path" "$linked_app"
expected_app_message="Symbolic link not allowed: $linked_app"
expect_symlink_rejection "app verifier rejects symlinked app" "$expected_app_message" \
    "$script_dir/VerifyIDAPastelApp.sh" "$linked_app"
expect_symlink_rejection "app verifier rejects symlinked app with trailing slash" "$expected_app_message" \
    "$script_dir/VerifyIDAPastelApp.sh" "$linked_app/"
expect_symlink_rejection "DMG builder rejects symlinked source" "$expected_app_message" \
    "$script_dir/BuildIDAPastelDMG.sh" "$linked_app" "$work_dir/output"

copy_wrapper_dir="$work_dir/copy-wrapper"
mkdir -p "$copy_wrapper_dir"
ln -s "$script_dir/TestIDAPastelPackaging.sh" "$copy_wrapper_dir/cp"
expect_symlink_rejection "DMG builder verifies the staged app copy" "Symbolic link not allowed:" \
    /usr/bin/env "PATH=$copy_wrapper_dir:$PATH" \
    "$script_dir/BuildIDAPastelDMG.sh" "$app_path" "$work_dir/staged-output"

critical_app="$work_dir/CriticalPaths.app"
cp -R "$app_path" "$critical_app"
for critical_relative_path in \
    Contents/Info.plist \
    Contents/MacOS/IDAPastel \
    Contents/Resources/node/bin/node \
    Contents/Resources/sap-signer
do
    critical_path="$critical_app/$critical_relative_path"
    critical_name="$(basename "$critical_path")"
    mv "$critical_path" "$critical_path.real"
    ln -s "$critical_name.real" "$critical_path"
    expect_symlink_rejection "app verifier rejects symlinked $critical_relative_path" \
        "Symbolic link not allowed: $critical_path" \
        "$script_dir/VerifyIDAPastelApp.sh" "$critical_app"
    rm "$critical_path"
    mv "$critical_path.real" "$critical_path"
done

malicious_stage="$work_dir/malicious-stage"
malicious_dmg="$work_dir/IDAPastel-symlink-arm64.dmg"
mkdir -p "$malicious_stage"
ln -s "$app_path" "$malicious_stage/IDAPastel.app"
ln -s /Applications "$malicious_stage/Applications"
hdiutil create -volname IDAPastel-Symlink-Test -srcfolder "$malicious_stage" -ov -format UDZO "$malicious_dmg" >/dev/null
(
    cd "$work_dir"
    shasum -a 256 "$(basename "$malicious_dmg")" > "$(basename "$malicious_dmg").sha256"
)
expect_symlink_rejection "DMG verifier rejects symlinked mounted app" \
    "Mounted IDAPastel.app must be a real directory" \
    "$script_dir/VerifyIDAPastelDMG.sh" "$malicious_dmg"
