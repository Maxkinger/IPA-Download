# IDAPastel tvOS Support and DMG Distribution Design

## Summary

Create a long-lived `tv` branch that produces an independently installable macOS app named `IDAPastel`. The branch adds Apple TV app discovery and tvOS IPA download support by porting the proven platform-selection behavior from `majd/ipatool`, while keeping the upstream `main` branch clean and easy to synchronize.

IDAPastel is a self-use build. It is distributed as an arm64, ad hoc-signed DMG through GitHub Actions and GitHub Releases. It does not require Apple Developer Program membership, Developer ID signing, or Apple notarization.

## Goals

- Keep local and forked `main` synchronized with `Maxkinger/IPA-Download` without custom product changes.
- Maintain all IDAPastel work on a long-lived `tv` branch.
- Allow Pastel and IDAPastel to be installed and run side by side.
- Isolate accounts, Keychain items, sessions, settings, app data, and default downloads from Pastel.
- Search for Apple TV apps and look them up by App ID or supported App Store input.
- Download the latest tvOS package or a package identified by a known external version ID.
- Reject an iOS package returned by mistake when Apple TV was requested.
- Produce a mountable IDAPastel DMG in GitHub Actions without paid Apple credentials.
- Preserve a low-conflict path for merging future upstream changes into `tv`.

## Non-goals

- A complete tvOS historical-version catalog in the first release.
- tvOS data from Timbrd, Agzy, or Bilin in the first release.
- AirDrop installation to Apple TV.
- Automatic installation on Apple TV.
- Apple Developer ID signing, hardened-runtime adoption, or notarization.
- Mac App Store distribution.
- Sparkle automatic updates in the first release.
- Renaming the Xcode project, target, Swift source file, or internal Swift type names.
- Redesigning the existing application icon.

## Repository and Branch Model

Use two Git remotes after the user creates a GitHub fork:

- `upstream`: `https://github.com/Maxkinger/IPA-Download.git`
- `origin`: the user's writable GitHub fork

Branches have fixed responsibilities:

- `main` mirrors `upstream/main` and contains no IDAPastel-specific commits.
- `tv` contains the IDAPastel identity, tvOS support, tests, documentation, and GitHub Actions.

Initial setup:

```bash
git remote rename origin upstream
git remote add origin <user-fork-url>
git switch main
git push -u origin main
git switch tv
git push -u origin tv
```

Upstream synchronization uses merge commits on `tv`, not rebasing or force-pushing:

```bash
git switch main
git fetch upstream
git merge --ff-only upstream/main
git push origin main

git switch tv
git merge main
git push origin tv
```

Keeping the Xcode project name, target name, `PastelApp.swift` filename, and internal Swift names unchanged minimizes recurring merge conflicts. Only product identity and user-facing identity change.

## Product Identity and Data Isolation

The final product identity is:

- App bundle: `IDAPastel.app`
- Display name: `IDAPastel`
- Product name: `IDAPastel`
- Bundle identifier: `com.idapastel.app`
- Default download directory: `~/Downloads/IDAPastel`

The Xcode target remains named `Pastel`. The product reference and `PRODUCT_NAME` change only as needed to emit `IDAPastel.app`.

Persistent state is isolated as follows:

- Swift application support: `~/Library/Application Support/IDAPastel`
- Node session fallback: `~/Library/Application Support/IDAPastel/sessions`
- Device GUID Keychain service: `com.idapastel.app.device-guid`
- Apple account password Keychain service: `com.idapastel.app.apple-account-password`
- UserDefaults domain: automatically isolated by `com.idapastel.app`
- Temporary working directories: use an `IDAPastel-` prefix

No automatic migration reads or copies Pastel accounts, sessions, settings, or passwords. The user may deliberately select another download directory, but the fresh-install default remains independent.

Process-local names such as notification identifiers and Swift type names may retain `Pastel` because they cannot collide between separate app processes and changing them would create unnecessary upstream merge conflicts.

### Sparkle Isolation

The existing Sparkle feed and EdDSA public key belong to the upstream Pastel product. IDAPastel must not consume that feed because it could replace IDAPastel with a Pastel release.

For the first release:

- Disable automatic update checks.
- Disable or hide the manual “Check for Updates” action.
- Do not use the upstream `SUFeedURL`, `SUPublicEDKey`, or `appcast.xml` for IDAPastel.
- Keep the existing Sparkle dependency only where needed to minimize invasive upstream conflicts.
- Distribute updates manually through IDAPastel GitHub Releases.

A future design may add a dedicated IDAPastel Sparkle key and appcast. Sparkle EdDSA signing is independent of Apple Developer Program membership.

## tvOS Platform Model

Add a first-class Apple TV platform throughout Swift and Node layers.

Canonical internal value:

```text
appletv
```

Accepted input aliases:

```text
tv
tvos
tvOS
apple-tv
appletv
AppleTV
```

Swift exposes an `appleTV` platform case with the `appletv` raw value, the `appletv` SF Symbol, and the user-facing title “Apple TV”. Node normalization maps every accepted alias to `appletv`; unknown values continue to default to iPhone only where existing behavior requires a default.

## Catalog and Lookup Behavior

Follow the platform mapping proven in `majd/ipatool`:

- Apple TV lookup entity: `tvSoftware`
- Apple TV search entity: `software,tvSoftware`
- Apple TV metadata platform: `atv9`

Search, lookup, and platform normalization receive an explicit `platform` argument. Results selected while Apple TV is active retain the `appletv` platform through the Swift view model and download configuration.

The first release does not fabricate Apple TV featured charts from iPhone RSS feeds. If a verified Apple TV chart source is unavailable, the Apple TV landing state prompts the user to search or enter an App ID.

For universal-purchase apps that share an Adam ID between iOS and tvOS, the platform-specific external version lookup and final package validation determine which package is accepted.

## Latest tvOS Version Resolution

When Apple TV is selected and no external version ID was supplied, query:

```text
https://uclient-api.itunes.apple.com/WebObjects/MZStorePlatform.woa/wa/lookup
```

with these parameters:

```text
version=2
id=<adam-id>
p=mdm-lockup
caller=MDM
platform=atv9
cc=<lowercase-country-code>
l=en
```

Resolve the external version ID from the first offer in this order:

1. `offers[0].version.externalId`
2. The version field embedded in `offers[0].buyParams`

The parser accepts a JSON string or number for `externalId`. Missing results, missing offers, and missing version IDs are distinct errors with localized user-facing messages.

When the user supplies an external version ID manually, skip latest-version resolution and send that ID directly through the existing download flow.

## Download Data Flow

The Apple TV download flow is:

```text
Apple TV selection
  -> tvSoftware search/lookup
  -> Adam ID
  -> atv9 latest external-version lookup, unless manually supplied
  -> existing StoreServices license/download request
  -> download and MD5 verification
  -> AppleTVOS package validation
  -> existing SINF/metadata packaging
  -> downloaded-item indexing as Apple TV
```

The existing purchase and `volumeStoreDownloadProduct` endpoints remain unchanged because `ipatool` uses the same endpoints for iOS and tvOS. The platform-specific external version ID is the selector that directs the existing request to the tvOS package.

## Package Validation and Cleanup

Before modifying the downloaded archive, inspect the main app's `Payload/*.app/Info.plist`. When Apple TV was requested, `CFBundleSupportedPlatforms` must contain `AppleTVOS`.

If validation fails:

- Delete the mismatched output file.
- Delete temporary download parts.
- Do not add the file to the downloaded-items index.
- Report that Apple returned a non-tvOS package for the requested app/version.

After platform validation passes, the existing MD5, SINF, and metadata flow continues. Downloaded records preserve a normalized `appletv` platform marker even if optional Apple metadata omits a friendly platform value.

## Apple TV User Interface

The platform picker gains an Apple TV option alongside iPhone, iPad, and Vision.

In Apple TV mode:

- Search and App ID lookup remain available.
- Apple is the only version source.
- The latest version can be resolved and downloaded.
- A known external version ID can be entered manually.
- Third-party history-source controls are disabled or hidden.
- “Download All” is disabled because a complete TV history is not available.
- AirDrop is not offered as an Apple TV installation path.
- Reveal in Finder and delete remain available for downloaded TV packages.
- Downloaded rows and groups display an Apple TV platform label.

The first release documents that installing a tvOS IPA is outside IDAPastel's scope and typically requires a separate Xcode or Apple Configurator workflow appropriate to the user's device.

## Error Handling

The feature distinguishes at least these failures:

- No Apple TV catalog result for the selected storefront.
- The app has no tvOS offer in the `atv9` metadata response.
- Apple TV external version ID cannot be parsed.
- The account lacks a required license.
- StoreServices returns an authentication/session error.
- The downloaded package is missing `AppleTVOS` support.
- The package cannot be opened or its `Info.plist` cannot be decoded.
- Download cleanup fails after a primary error.

Machine-readable error codes are used between Node and Swift where existing architecture supports them. Localized messages explain the next user action without leaking account tokens, cookies, passwords, or raw authenticated responses.

## Automated Testing

Node unit tests cover:

- Accepted Apple TV aliases and rejection/default behavior.
- `tvSoftware` lookup query generation.
- `software,tvSoftware` search query generation.
- `atv9` metadata request parameters.
- String and numeric external version IDs.
- `buyParams` fallback parsing.
- Missing results, offers, and version IDs.
- Positive `AppleTVOS` package validation.
- Rejection of iPhoneOS and malformed packages.
- Deletion of a mismatched package.
- Existing session-expiry and authentication behavior.

Swift verification consists of compiling the app and exercising platform propagation through existing view-model entry points. No live Apple credentials are stored in the repository or GitHub Actions.

## Manual End-to-End Verification

Use a free Apple TV app and a local Apple account outside CI:

1. Install Pastel and IDAPastel side by side.
2. Add an account to IDAPastel and confirm it is absent from Pastel.
3. Confirm each app has a distinct Application Support directory and Keychain service.
4. Search for a free Apple TV app.
5. Resolve its `atv9` external version ID.
6. Download the package.
7. Inspect `Payload/*.app/Info.plist` and confirm `AppleTVOS`.
8. Restart IDAPastel and confirm its session is reusable.
9. Confirm Pastel settings and sessions remain unchanged.

## GitHub Actions Build and DMG Workflow

Add `.github/workflows/build-idapastel-dmg.yml` and a reusable local packaging script under `Scripts/` so local and CI packaging use the same commands.

Triggers:

- Push to `tv`: test, build, package, and upload an Actions artifact.
- Pull request targeting `tv`: test, build, and package without publishing a release.
- `workflow_dispatch`: test, build, package, and upload an artifact.
- Tag matching `idapastel-v*`: test, build, package, upload an artifact, and create a GitHub Release.

The workflow runs on the GitHub-hosted `macos-26` arm64 image and verifies that the selected Xcode major version is 26. The repository's bundled Node executable is arm64, so the workflow must not switch to an Intel runner.

Build constraints:

- Configuration: `Release`
- Destination architecture: `arm64`
- Code-sign identity: `-` (ad hoc)
- Hardened Runtime: disabled
- Notarization: disabled
- Apple certificate secrets: none
- Apple account credentials: none

The Node dependency tree receives a committed `package-lock.json`, and CI installs it reproducibly with `npm ci`. Swift dependencies remain pinned through the existing `Package.resolved`.

The packaging script creates a staging directory containing:

```text
IDAPastel.app
Applications -> /Applications
```

It then creates a compressed UDZO disk image with `hdiutil`.

Output names:

```text
IDAPastel-<marketing-version>-arm64.dmg
IDAPastel-<marketing-version>-arm64.dmg.sha256
```

CI validates:

- The main app exists and is arm64.
- The bundle identifier is `com.idapastel.app`.
- The bundle and executable names are IDAPastel.
- The bundled Node and `sap-signer` are executable and arm64.
- Sparkle and nested code pass structural code-sign verification.
- `codesign --verify --deep --strict` succeeds for the app's ad hoc signature structure.
- The DMG mounts read-only.
- The mounted DMG contains IDAPastel and the Applications link.
- The SHA-256 file matches the DMG.

The workflow does not expect Gatekeeper or `spctl` approval because an ad hoc-signed, unnotarized artifact intentionally lacks Developer ID trust. Documentation explains right-click Open, System Settings > Privacy & Security > Open Anyway, and quarantine removal for a trusted self-built artifact.

Actions artifacts use a finite retention period. A tag build publishes the DMG and checksum using the repository's `GITHUB_TOKEN`; no third-party release credentials are required.

## Upstream Merge Safety

Every merge from `main` into `tv` reruns Node tests, the Xcode Release build, and DMG validation. Expected recurring conflict areas are limited to:

- `Pastel.xcodeproj/project.pbxproj`
- `Pastel/Info.plist`
- Product identity constants in `Pastel/PastelApp.swift`
- Node platform/download files changed by upstream

Avoiding project, target, source-file, and internal-type renames keeps those conflicts localized. IDAPastel-specific tests are retained even when upstream reorganizes platform code, so a syntactically successful merge cannot silently remove tvOS behavior.

## Attribution

The tvOS protocol behavior is based on the MIT-licensed implementation in `majd/ipatool`, including its Apple TV platform mapping, `atv9` metadata lookup, and `AppleTVOS` validation. Preserve an attribution entry in IDAPastel's README or About view and retain any license notice required by copied or closely derived code.

Reference implementation:

- <https://github.com/majd/ipatool>
- <https://github.com/majd/ipatool/pull/478>

## Acceptance Criteria

- `main` remains identical to, or fast-forwardable from, `upstream/main` with no IDAPastel commits.
- `tv` contains all IDAPastel changes and accepts normal merges from `main`.
- Pastel and IDAPastel can coexist in `/Applications`.
- IDAPastel uses a distinct Bundle ID, UserDefaults domain, Keychain services, Application Support directory, sessions, and default download directory.
- IDAPastel never consumes the upstream Pastel Sparkle feed.
- Apple TV search and App ID lookup are available.
- Latest tvOS version lookup uses `platform=atv9`.
- A known tvOS external version ID can be downloaded manually.
- A requested Apple TV download is retained only when the package declares `AppleTVOS`.
- Third-party and complete-history claims are not shown for Apple TV in the first release.
- Existing iPhone, iPad, and Vision behavior continues to build and pass tests.
- GitHub Actions produces a mountable arm64 IDAPastel DMG and checksum without Apple secrets.
- A tag matching `idapastel-v*` creates a GitHub Release containing the DMG and checksum.
- Documentation clearly states the macOS 26+, Apple-silicon, ad hoc-signing, Gatekeeper, and self-use constraints.
