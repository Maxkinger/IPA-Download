# Task 4 Report: Strict TV Chart Links and Storefront Gates

## Status

Complete. Implemented against baseline `f440b44` on branch `tv` with strict TDD.

## RED

Command:

```sh
cd NodeProject && node --test test/tvos-ranking.test.js test/catalog.test.js
```

Result: exit `1`; `17` tests, `13` passed, `4` failed.

Expected failures:

- `country menu selection routes storefront changes through the platform availability gate`: `selectCountry` did not match `applyStorefrontCountry(country.code, reload: true)` and still contained direct country assignments.
- `downloaded app navigation routes storefront changes through the platform availability gate`: `searchForApp` did not match `applyStorefrontCountry(code, reload: false)` and still contained direct country assignments.
- `does not treat chart text in an app link query as a chart shelf`: actual `['999']`, expected `[]`.
- `does not treat a chart path on an external origin as an Apple chart shelf`: actual `['999']`, expected `[]`.

The focused RED run used only local fixtures and injected clients; it made no Apple network requests.

## GREEN

Focused command:

```sh
cd NodeProject && node --test test/tvos-ranking.test.js test/catalog.test.js
```

Output summary:

```text
1..17
# tests 17
# pass 17
# fail 0
# duration_ms 181.772125
```

Full Node command:

```sh
cd NodeProject && npm test
```

Output summary:

```text
1..46
# tests 46
# pass 46
# fail 0
# duration_ms 321.687291
```

The Node suite used local fixtures, temporary files, and injected clients; it made no Apple network requests.

Xcode command:

```sh
xcodebuild -project Pastel.xcodeproj -scheme IDAPastel -configuration Debug -derivedDataPath .build/idapastel-ranking-gate CODE_SIGN_IDENTITY=- build
```

The first sandboxed attempt exited `74` while resolving the existing Sparkle package because DNS access to `github.com` was blocked. The same required build was rerun with approved package/Xcode service access. Final output:

```text
Resolved source packages:
  Sparkle: https://github.com/sparkle-project/Sparkle @ 2.9.3
** BUILD SUCCEEDED **
exit_code=0
```

No Apple endpoint was contacted by the tests.

## Files Changed

- `NodeProject/src/tvos-ranking.js`
  - Replaced section-wide chart-path substring matching with per-`href` URL parsing.
  - Requires resolved origin `https://apps.apple.com`, pathname `^/[a-z]{2}/tv/charts/36$`, and exact `chart` query value.
  - Retains the existing English `aria-label` fallback.
- `NodeProject/test/tvos-ranking.test.js`
  - Added negative coverage for an ordinary app query containing a chart path.
  - Added negative coverage for the chart path on a non-Apple absolute origin.
- `NodeProject/test/catalog.test.js`
  - Added scoped static regressions for `selectCountry` and `searchForApp` storefront routing.
- `Pastel/PastelApp.swift`
  - Routes unmatched country-menu selection through `applyStorefrontCountry(country.code, reload: true)`.
  - Preserves `accountStore.select(match)` for a different matching account.
  - Routes downloaded-app storefront state through `applyStorefrontCountry(code, reload: false)` before query/search setup.

## Self-review

- Confirmed parser validation is applied to each actual quoted `href`, not arbitrary text in a section or query-value substring.
- Confirmed relative chart links resolve to the official base while absolute/protocol-relative external origins are rejected by the exact origin check.
- Confirmed path matching is anchored and the requested chart is compared through `URLSearchParams`.
- Confirmed English `Top Free`/`Top Paid` aria-label fallback remains unchanged.
- Confirmed `selectCountry` has no direct `selectedCountryCode` or `catalog.country` writes and synchronously applies the existing platform fallback when no different matching account is selected.
- Confirmed `searchForApp` applies downloaded platform first, then storefront fallback, then sets query/right panel and searches.
- Confirmed `Pastel/AppStorePlatformAvailability.swift` was not modified.
- `git diff --check` completed with no whitespace errors.

## Concerns

- No functional concerns found in the requested scope.
- Xcode reports the pre-existing warning that multiple macOS destinations match and chooses the first; the build still exits `0`.
- The first build needed GitHub access only to resolve the existing Sparkle dependency after using a fresh derived-data path; this was an environment limitation, not a source or test failure.
