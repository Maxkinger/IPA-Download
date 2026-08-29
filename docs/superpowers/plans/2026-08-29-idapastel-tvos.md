# IDAPastel tvOS 功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在长期 `tv` 分支上生成与 Pastel 完全隔离的 IDAPastel，并增加可验证的 Apple TV 搜索、最新 tvOS IPA 下载和无证书 DMG Actions。

**Architecture:** 保留现有 Xcode 工程、Target 和单文件 SwiftUI 结构，只修改最终产品身份；Node 侧把平台映射、`atv9` 版本查询和 IPA 平台校验拆成三个可独立测试的模块，再接入现有 StoreServices 下载链路。GitHub Actions 调用与本机相同的验证和 DMG 脚本，输出 arm64、Ad Hoc 签名、未经公证的自用安装包。

**Tech Stack:** Swift 5 / SwiftUI / macOS 26 / Xcode 26、Node.js ESM / `node:test` / axios / node-stream-zip / plist、Bash / `xcodebuild` / `codesign` / `hdiutil`、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-08-29-idapastel-tvos-design-zh-CN.md`

## Global Constraints

- 所有实现提交只进入 `tv`；不得切换到 `main` 后提交产品改动。
- `main` 必须保持与 `upstream/main` 可快进同步。
- 保留 `Pastel.xcodeproj`、Xcode Target `Pastel`、`Pastel/PastelApp.swift` 文件名和内部 Swift 类型名。
- 最终产品固定为 `IDAPastel.app`，Bundle ID 固定为 `com.idapastel.app`。
- IDAPastel 不迁移、不读取 Pastel 的 Keychain、UserDefaults、会话或 Application Support 数据。
- 第一版 Apple TV 仅支持搜索、App ID 查找、最新版本和手动外部版本 ID；不宣称完整 TV 历史版本。
- Apple TV 下载结果必须在 `CFBundleSupportedPlatforms` 中包含 `AppleTVOS`。
- 现有 iPhone、iPad 和 Vision 行为不得回归。
- 构建架构固定为 arm64，最低系统固定为 macOS 26。
- DMG 仅使用 Ad Hoc 签名，不启用 Hardened Runtime，不执行公证，不配置 Apple 证书或账户 Secret。
- GitHub Remote 和推送操作不属于本计划执行范围；用户提供可写 Fork 地址后再单独配置和推送。
- 从 `majd/ipatool` 紧密移植的代码必须在 README 或“关于”页面保留 MIT 来源说明。

---

## File Structure

新增文件及职责：

- `NodeProject/src/platform.js`：统一 iPhone、iPad、Vision、Apple TV 平台别名和 Apple API Entity 映射。
- `NodeProject/src/tvos-version.js`：构造 `atv9` 查询并解析最新 Apple TV 外部版本 ID。
- `NodeProject/src/package-platform.js`：读取 IPA 主 App 的 `Info.plist` 并验证 `AppleTVOS`。
- `NodeProject/test/platform.test.js`：平台别名和 Entity 映射单元测试。
- `NodeProject/test/tvos-version.test.js`：`atv9` URL、Offer 和 `buyParams` 解析测试。
- `NodeProject/test/package-platform.test.js`：正确 TV 包、iOS 包和损坏包测试。
- `NodeProject/test/tvos-download-flow.test.js`：版本解析、下载清理和现有 `Ipa` 集成测试。
- `Scripts/VerifyIDAPastelApp.sh`：验证构建产物身份、架构、嵌套可执行文件和签名结构。
- `Pastel.xcodeproj/xcshareddata/xcschemes/IDAPastel.xcscheme`：提供本机和 CI 共用的稳定共享 Scheme，Target 仍为 `Pastel`。
- `Scripts/BuildIDAPastelDMG.sh`：生成 DMG 和 SHA-256 文件。
- `Scripts/VerifyIDAPastelDMG.sh`：只读挂载并验证 DMG。
- `.github/workflows/build-idapastel-dmg.yml`：测试、构建、Artifact 和 Tag Release 流水线。
- `README-IDAPastel.md`：自用安装、Gatekeeper、TV 范围和来源说明。
- `NodeProject/package-lock.json`：固定 Node 依赖树。

修改文件及职责：

- `Pastel.xcodeproj/project.pbxproj`：生成 `IDAPastel.app` 和新 Bundle ID，Target 名保持不变。
- `Pastel/Info.plist`：关闭并移除上游 Sparkle Feed 身份。
- `Pastel/PastelApp.swift`：产品隔离、Apple TV UI、平台传递、下载记录和更新入口禁用。
- `Pastel/Localizable.xcstrings`：Apple TV 和 IDAPastel 新文案。
- `NodeProject/src/catalog.js`：使用统一平台模块并支持 `tvSoftware`。
- `NodeProject/src/ipa.js`：解析 TV 版本、验证下载包、隔离会话目录。
- `NodeProject/src/i18n.js`：tvOS 错误文案。
- `NodeProject/main.js`：传递 `DOWNLOAD_PLATFORM`。
- `README.md`：增加 IDAPastel 文档入口和 `ipatool` tvOS 署名。

---

### Task 1: IDAPastel 产品身份与本地数据隔离

**Files:**
- Create: `Scripts/VerifyIDAPastelApp.sh`
- Create: `Pastel.xcodeproj/xcshareddata/xcschemes/IDAPastel.xcscheme`
- Modify: `Pastel.xcodeproj/project.pbxproj:17,47,83-84,209-253`
- Modify: `Pastel/Info.plist:1-37`
- Modify: `Pastel/PastelApp.swift:10,208-420,500-680,4630-4660,8128-8462`
- Modify: `NodeProject/src/ipa.js:18-28`
- Test: `Scripts/VerifyIDAPastelApp.sh`

**Interfaces:**
- Consumes: 当前 Xcode Target `Pastel` 和现有 Bundle Node 构建阶段。
- Produces: `IDAPastel.app`、Bundle ID `com.idapastel.app`、独立 Keychain/Application Support/UserDefaults，以及后续 CI 共用的 App 验证脚本。

- [ ] **Step 1: 编写身份验证脚本**

新增可执行脚本，核心内容如下：

```bash
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
```

将最后一项 Sparkle 检查实现为读取 Plist，而不是依赖虚构路径：

```bash
if /usr/libexec/PlistBuddy -c 'Print :SUFeedURL' "$info_plist" >/dev/null 2>&1; then
    echo 'SUFeedURL must be absent for IDAPastel' >&2
    exit 1
fi
```

创建共享 Scheme，引用现有 Blueprint ID `1A0000000000000000000002`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2650" version="1.7">
  <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES">
    <BuildActionEntries>
      <BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">
        <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="1A0000000000000000000002" BuildableName="IDAPastel.app" BlueprintName="Pastel" ReferencedContainer="container:Pastel.xcodeproj"/>
      </BuildActionEntry>
    </BuildActionEntries>
  </BuildAction>
  <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="YES">
    <BuildableProductRunnable runnableDebuggingMode="0">
      <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="1A0000000000000000000002" BuildableName="IDAPastel.app" BlueprintName="Pastel" ReferencedContainer="container:Pastel.xcodeproj"/>
    </BuildableProductRunnable>
  </LaunchAction>
  <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES">
    <BuildableProductRunnable runnableDebuggingMode="0">
      <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="1A0000000000000000000002" BuildableName="IDAPastel.app" BlueprintName="Pastel" ReferencedContainer="container:Pastel.xcodeproj"/>
    </BuildableProductRunnable>
  </ProfileAction>
  <AnalyzeAction buildConfiguration="Debug"/>
  <ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
```

Run: `chmod +x Scripts/VerifyIDAPastelApp.sh`

- [ ] **Step 2: 运行验证脚本确认当前产品身份失败**

Run:

```bash
xcodebuild -project Pastel.xcodeproj -scheme IDAPastel -configuration Release -derivedDataPath .build/idapastel CODE_SIGN_IDENTITY=- build
Scripts/VerifyIDAPastelApp.sh .build/idapastel/Build/Products/Release/Pastel.app
```

Expected: FAIL，至少报告当前 Bundle ID 为 `com.allenmiao.ipahistorydownload`，而不是 `com.idapastel.app`。

- [ ] **Step 3: 修改 Xcode 产品身份，保留 Target 名**

在 Debug 和 Release 中设置：

```text
PRODUCT_BUNDLE_IDENTIFIER = com.idapastel.app;
PRODUCT_NAME = IDAPastel;
ARCHS = arm64;
CODE_SIGN_IDENTITY = "-";
ENABLE_HARDENED_RUNTIME = NO;
```

将 Products 下的文件引用从 `Pastel.app` 调整为 `IDAPastel.app`，但保留：

```text
name = "Pastel";
productName = Pastel;
```

- [ ] **Step 4: 隔离 Swift 和 Node 持久化身份**

在 `PastelApp.swift` 使用这些精确常量：

```swift
private let appDisplayName = "IDAPastel"

private enum IDAPastelIdentity {
    static let bundleID = "com.idapastel.app"
    static let deviceGUIDService = "com.idapastel.app.device-guid"
    static let accountPasswordService = "com.idapastel.app.apple-account-password"
    static let applicationSupportDirectory = "IDAPastel"
}
```

把两个 Keychain Service 切换到上述常量，把 Keychain Description 中的 `Pastel` 改成 `IDAPastel`，把临时目录前缀改为 `IDAPastel-`。Node 的三平台会话兜底目录都改成 `IDAPastel/sessions`。

首次加载默认下载目录改为：

```swift
if downloadDir.isEmpty {
    let downloads = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
        ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Downloads")
    let idapastel = downloads.appendingPathComponent("IDAPastel", isDirectory: true)
    try? FileManager.default.createDirectory(at: idapastel, withIntermediateDirectories: true)
    downloadDir = idapastel.path
}
```

- [ ] **Step 5: 禁用上游 Sparkle 更新源**

在 `Info.plist` 中设置 `SUEnableAutomaticChecks` 为 `false`，删除 `SUFeedURL`、`SUPublicEDKey` 和 `SUVerifyUpdateBeforeExtraction`。将 `SPUStandardUpdaterController` 改为 `startingUpdater: false`，并移除“关于”页的 `CheckForUpdatesSettingsRow` 及命令菜单中的 `CheckForUpdatesMenuItem`。

- [ ] **Step 6: 重建并验证身份**

Run:

```bash
rm -rf .build/idapastel
xcodebuild -project Pastel.xcodeproj -scheme IDAPastel -configuration Release -derivedDataPath .build/idapastel CODE_SIGN_IDENTITY=- build
Scripts/VerifyIDAPastelApp.sh .build/idapastel/Build/Products/Release/IDAPastel.app
```

Expected: PASS；输出 App、主程序、Node 和 `sap-signer` 均为 arm64，Bundle ID 为 `com.idapastel.app`，且没有 `SUFeedURL`。

- [ ] **Step 7: 提交产品隔离**

```bash
git add Pastel.xcodeproj/project.pbxproj Pastel.xcodeproj/xcshareddata/xcschemes/IDAPastel.xcscheme Pastel/Info.plist Pastel/PastelApp.swift NodeProject/src/ipa.js Scripts/VerifyIDAPastelApp.sh
git commit -m "feat: isolate IDAPastel product identity"
```

---

### Task 2: 统一平台模型并接入 Apple TV 搜索

**Files:**
- Create: `NodeProject/src/platform.js`
- Create: `NodeProject/test/platform.test.js`
- Modify: `NodeProject/src/catalog.js:35-77,168-370,493-500`
- Test: `NodeProject/test/platform.test.js`

**Interfaces:**
- Consumes: `catalog.js` 当前的 `iphone`、`ipad` 和 `vision` 字符串。
- Produces: `normalizeAppPlatform(value) -> "iphone" | "ipad" | "vision" | "appletv"`、`lookupEntityForPlatform()`、`searchEntityForPlatform()`、`metadataPlatformForPlatform()` 和 `isAppleTVPlatform()`。

- [ ] **Step 1: 编写平台映射失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isAppleTVPlatform,
    lookupEntityForPlatform,
    metadataPlatformForPlatform,
    normalizeAppPlatform,
    searchEntityForPlatform,
} from '../src/platform.js';

test('normalizes Apple TV aliases', () => {
    for (const value of ['tv', 'tvos', 'tvOS', 'apple-tv', 'appletv', 'AppleTV']) {
        assert.equal(normalizeAppPlatform(value), 'appletv', value);
        assert.equal(isAppleTVPlatform(value), true, value);
    }
});

test('preserves existing platforms and defaults unknown values to iphone', () => {
    assert.equal(normalizeAppPlatform('iPadOS'), 'ipad');
    assert.equal(normalizeAppPlatform('visionOS'), 'vision');
    assert.equal(normalizeAppPlatform('watchOS'), 'iphone');
});

test('maps Apple TV API entities', () => {
    assert.equal(lookupEntityForPlatform('appletv'), 'tvSoftware');
    assert.equal(searchEntityForPlatform('appletv'), 'software,tvSoftware');
    assert.equal(metadataPlatformForPlatform('appletv'), 'atv9');
});
```

- [ ] **Step 2: 运行单个测试确认失败**

Run: `cd NodeProject && node --test test/platform.test.js`

Expected: FAIL，错误为找不到 `src/platform.js`。

- [ ] **Step 3: 实现平台模块**

```js
function compact(value) {
    return String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function normalizeAppPlatform(value) {
    const platform = compact(value);
    if (['ipad', 'ipados', 'tablet'].includes(platform)) return 'ipad';
    if (['vision', 'visionpro', 'visionos', 'applevisionpro'].includes(platform)) return 'vision';
    if (['tv', 'tvos', 'appletv'].includes(platform)) return 'appletv';
    return 'iphone';
}

export function isAppleTVPlatform(value) {
    return normalizeAppPlatform(value) === 'appletv';
}

export function lookupEntityForPlatform(value) {
    const platform = normalizeAppPlatform(value);
    if (platform === 'ipad') return 'iPadSoftware';
    if (platform === 'appletv') return 'tvSoftware';
    return 'software';
}

export function searchEntityForPlatform(value) {
    return isAppleTVPlatform(value) ? 'software,tvSoftware' : lookupEntityForPlatform(value);
}

export function metadataPlatformForPlatform(value) {
    return isAppleTVPlatform(value) ? 'atv9' : 'enterprisestore';
}
```

所有实际最新 TV 版本请求必须在 URL 查询中形成字面参数 `platform=atv9`。

- [ ] **Step 4: 在 catalog 中使用统一平台模块**

删除 `normalizeSearchPlatform` 和本地 `searchEntityForPlatform`，改为从 `platform.js` 导入。`lookupApp` 使用 `lookupEntityForPlatform`，`searchApps` 使用 `searchEntityForPlatform`。`appPlatformFromItem` 对 `appletv` 和 `vision` 都优先返回显式平台。

Apple TV 不复用 iPhone RSS：

```js
if (cleanPlatform === 'appletv') {
    return {
        queryType: 'featured',
        count: 0,
        offset: cleanOffset,
        limit: cleanLimit,
        hasMore: false,
        results: [],
    };
}
```

- [ ] **Step 5: 运行平台与现有测试**

Run:

```bash
cd NodeProject
node --test test/platform.test.js
npm test
```

Expected: 新平台测试全部 PASS，现有会话测试无回归。

- [ ] **Step 6: 提交平台模型**

```bash
git add NodeProject/src/platform.js NodeProject/src/catalog.js NodeProject/test/platform.test.js
git commit -m "feat: add Apple TV catalog platform"
```

---

### Task 3: 实现 `atv9` 最新版本查询

**Files:**
- Create: `NodeProject/src/tvos-version.js`
- Create: `NodeProject/test/tvos-version.test.js`
- Test: `NodeProject/test/tvos-version.test.js`

**Interfaces:**
- Consumes: Adam ID、两位国家代码和可注入的 axios 风格 Client。
- Produces: `buildTVVersionLookupURL(appID, country)`、`extractTVExternalVersionID(data, appID)`、`lookupLatestTVExternalVersionID(appID, options)`。

- [ ] **Step 1: 编写 URL 和解析失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildTVVersionLookupURL,
    extractTVExternalVersionID,
    lookupLatestTVExternalVersionID,
} from '../src/tvos-version.js';

test('builds the atv9 metadata URL', () => {
    const url = new URL(buildTVVersionLookupURL('42', 'US'));
    assert.equal(url.hostname, 'uclient-api.itunes.apple.com');
    assert.equal(url.searchParams.get('id'), '42');
    assert.equal(url.searchParams.get('platform'), 'atv9');
    assert.equal(url.searchParams.get('cc'), 'us');
    assert.equal(url.searchParams.get('p'), 'mdm-lockup');
    assert.equal(url.searchParams.get('caller'), 'MDM');
});

test('extracts string, numeric, and buyParams version IDs', () => {
    assert.equal(extractTVExternalVersionID({results: {'42': {offers: [{version: {externalId: '123'}}]}}}, '42'), '123');
    assert.equal(extractTVExternalVersionID({results: {'42': {offers: [{version: {externalId: 456}}]}}}, '42'), '456');
    assert.equal(extractTVExternalVersionID({results: {'42': {offers: [{buyParams: 'salableAdamId=42&appExtVrsId=789'}]}}}, '42'), '789');
});

test('uses the injected client', async () => {
    const client = {get: async () => ({data: {results: {'42': {offers: [{version: {externalId: '999'}}]}}}})};
    assert.equal(await lookupLatestTVExternalVersionID('42', {country: 'us', client}), '999');
});
```

另外增加以下错误断言：

```js
assert.throws(
    () => extractTVExternalVersionID({results: {}}, '42'),
    error => error.code === 'TVOS_NO_APP'
);
assert.throws(
    () => extractTVExternalVersionID({results: {'42': {offers: []}}}, '42'),
    error => error.code === 'TVOS_NO_OFFER'
);
assert.throws(
    () => extractTVExternalVersionID({results: {'42': {offers: [{}]}}}, '42'),
    error => error.code === 'TVOS_NO_VERSION'
);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd NodeProject && node --test test/tvos-version.test.js`

Expected: FAIL，错误为找不到 `src/tvos-version.js`。

- [ ] **Step 3: 实现 URL 和纯解析函数**

```js
import axios from 'axios';

const BASE_URL = 'https://uclient-api.itunes.apple.com/WebObjects/MZStorePlatform.woa/wa/lookup';

function codedError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

export function buildTVVersionLookupURL(appID, country = 'us') {
    const url = new URL(BASE_URL);
    url.search = new URLSearchParams({
        version: '2', id: String(appID), p: 'mdm-lockup', caller: 'MDM',
        platform: 'atv9', cc: String(country || 'us').toLowerCase(), l: 'en',
    }).toString();
    return url.toString();
}

export function extractTVExternalVersionID(data, appID) {
    const item = data?.results?.[String(appID)];
    if (!item) throw codedError('TVOS_NO_APP', 'Apple TV metadata returned no app');
    const offer = Array.isArray(item.offers) ? item.offers[0] : null;
    if (!offer) throw codedError('TVOS_NO_OFFER', 'Apple TV metadata returned no offer');
    const direct = offer?.version?.externalId;
    if (direct !== undefined && direct !== null && String(direct) !== '') return String(direct);
    const fallback = new URLSearchParams(String(offer.buyParams || '')).get('appExtVrsId');
    if (fallback) return fallback;
    throw codedError('TVOS_NO_VERSION', 'Apple TV metadata returned no external version ID');
}

export async function lookupLatestTVExternalVersionID(appID, {country = 'us', client = axios} = {}) {
    const {data} = await client.get(buildTVVersionLookupURL(appID, country));
    return extractTVExternalVersionID(data, appID);
}
```

- [ ] **Step 4: 运行测试并提交**

Run: `cd NodeProject && node --test test/tvos-version.test.js`

Expected: 全部 PASS。

```bash
git add NodeProject/src/tvos-version.js NodeProject/test/tvos-version.test.js
git commit -m "feat: resolve latest tvOS version ID"
```

---

### Task 4: 验证 IPA 的 `AppleTVOS` 平台

**Files:**
- Create: `NodeProject/src/package-platform.js`
- Create: `NodeProject/test/package-platform.test.js`
- Test: `NodeProject/test/package-platform.test.js`

**Interfaces:**
- Consumes: IPA 文件路径和规范化平台字符串。
- Produces: `validatePackageForPlatform(ipaPath, platform) -> Promise<void>`；平台不匹配时抛出 `TVOS_PLATFORM_MISMATCH`。

- [ ] **Step 1: 编写包校验失败测试**

测试使用 `archiver` 在临时目录生成四个最小 ZIP：一个 `AppleTVOS`、一个 `iPhoneOS`、一个缺少 `Info.plist`、一个包含无效 Plist。使用以下完整 Fixture Helper：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {createWriteStream, mkdtempSync, rmSync} from 'node:fs';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import archiver from 'archiver';
import plist from 'plist';
import {validatePackageForPlatform} from '../src/package-platform.js';

const fixtureDir = mkdtempSync(join(tmpdir(), 'idapastel-platform-test-'));

async function createIPA(name, platforms, rawInfo = null) {
    const outputPath = join(fixtureDir, name);
    const output = createWriteStream(outputPath);
    const zip = archiver('zip');
    zip.pipe(output);
    if (rawInfo !== null || platforms !== null) {
        const data = rawInfo ?? Buffer.from(plist.build({CFBundleSupportedPlatforms: platforms}));
        zip.append(data, {
            name: 'Payload/Test.app/Info.plist',
        });
    }
    await zip.finalize();
    await once(output, 'close');
    return outputPath;
}

test.after(() => rmSync(fixtureDir, {recursive: true, force: true}));
```

然后创建 Fixture 并断言：

```js
const tvIPA = await createIPA('tv.ipa', ['AppleTVOS']);
const phoneIPA = await createIPA('phone.ipa', ['iPhoneOS']);
const malformedIPA = await createIPA('missing-info.ipa', null);
const invalidInfoIPA = await createIPA('invalid-info.ipa', null, Buffer.from('not-a-plist'));

await assert.doesNotReject(() => validatePackageForPlatform(tvIPA, 'appletv'));
await assert.rejects(
    () => validatePackageForPlatform(phoneIPA, 'appletv'),
    error => error.code === 'TVOS_PLATFORM_MISMATCH'
);
await assert.rejects(
    () => validatePackageForPlatform(malformedIPA, 'appletv'),
    error => error.code === 'TVOS_INFO_MISSING'
);
await assert.rejects(
    () => validatePackageForPlatform(invalidInfoIPA, 'appletv'),
    error => error.code === 'TVOS_INFO_INVALID'
);
await assert.doesNotReject(() => validatePackageForPlatform(phoneIPA, 'iphone'));
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd NodeProject && node --test test/package-platform.test.js`

Expected: FAIL，错误为找不到 `src/package-platform.js`。

- [ ] **Step 3: 实现 ZIP 与 Plist 校验**

```js
import {execFileSync} from 'node:child_process';
import StreamZip from 'node-stream-zip';
import plist from 'plist';
import {isAppleTVPlatform} from './platform.js';

function codedError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function parseInfoPlist(data) {
    const xml = execFileSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '--', '-'], {input: data});
    return plist.parse(xml.toString('utf8'));
}

export async function validatePackageForPlatform(ipaPath, platform) {
    if (!isAppleTVPlatform(platform)) return;
    const zip = new StreamZip.async({file: ipaPath});
    try {
        const entries = await zip.entries();
        const entry = Object.values(entries)
            .filter(item => /^Payload\/[^/]+\.app\/Info\.plist$/i.test(item.name))
            .sort((a, b) => a.name.length - b.name.length)[0];
        if (!entry) throw codedError('TVOS_INFO_MISSING', 'tvOS package has no main Info.plist');
        let info;
        try {
            info = parseInfoPlist(await zip.entryData(entry.name));
        } catch {
            throw codedError('TVOS_INFO_INVALID', 'tvOS package main Info.plist is invalid');
        }
        const platforms = Array.isArray(info.CFBundleSupportedPlatforms) ? info.CFBundleSupportedPlatforms : [];
        if (!platforms.includes('AppleTVOS')) {
            throw codedError('TVOS_PLATFORM_MISMATCH', 'downloaded package does not declare AppleTVOS support');
        }
    } finally {
        await zip.close().catch(() => {});
    }
}
```

- [ ] **Step 4: 运行包测试和全量 Node 测试**

Run:

```bash
cd NodeProject
node --test test/package-platform.test.js
npm test
```

Expected: 全部 PASS。

- [ ] **Step 5: 提交包校验模块**

```bash
git add NodeProject/src/package-platform.js NodeProject/test/package-platform.test.js
git commit -m "feat: validate downloaded tvOS packages"
```

---

### Task 5: 接入现有下载引擎和 CLI 环境

**Files:**
- Create: `NodeProject/test/tvos-download-flow.test.js`
- Modify: `NodeProject/src/ipa.js:45-258`
- Modify: `NodeProject/main.js:92-124`
- Modify: `NodeProject/src/i18n.js:5-380`
- Test: `NodeProject/test/tvos-download-flow.test.js`

**Interfaces:**
- Consumes: `lookupLatestTVExternalVersionID`、`validatePackageForPlatform`、`DOWNLOAD_PLATFORM`。
- Produces: `Ipa.resolveAppVersionID(APPID, appVerId, platform)`、支持平台参数的 `listVersionIds`/`runDownload`/`run`，并在错误 TV 包时删除输出。

- [ ] **Step 1: 编写下载集成失败测试**

让 `Ipa` 构造器接受可选依赖，使用以下完整测试骨架，测试不访问 Apple：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Ipa} from '../src/ipa.js';

const credentials = {APPLE_ID: 'user@example.com', PASSWORD: 'secret', CODE: ''};

test('resolves only an implicit Apple TV version', async () => {
    const app = new Ipa(credentials, {
        lookupTVVersion: async () => '123456',
        validatePackage: async () => {},
    });
    assert.equal(await app.resolveAppVersionID('42', '', 'appletv'), '123456');
    assert.equal(await app.resolveAppVersionID('42', '777', 'appletv'), '777');
    assert.equal(await app.resolveAppVersionID('42', '', 'iphone'), '');
});

test('removes a package rejected by Apple TV validation', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'idapastel-download-flow-'));
    const output = join(directory, 'wrong-platform.ipa');
    writeFileSync(output, 'fixture');
    const app = new Ipa(credentials, {
        lookupTVVersion: async () => '123456',
        validatePackage: async () => {
            const error = new Error('wrong platform');
            error.code = 'TVOS_PLATFORM_MISMATCH';
            throw error;
        },
    });
    app.out = output;
    await assert.rejects(() => app.validateDownloadedPackage('appletv'));
    assert.equal(existsSync(output), false);
    rmSync(directory, {recursive: true, force: true});
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd NodeProject && node --test test/tvos-download-flow.test.js`

Expected: FAIL，`resolveAppVersionID` 尚不存在。

- [ ] **Step 3: 增加依赖注入和平台版本解析**

构造器签名固定为：

```js
constructor({APPLE_ID, PASSWORD, CODE}, {
    lookupTVVersion = lookupLatestTVExternalVersionID,
    validatePackage = validatePackageForPlatform,
} = {})
```

增加：

```js
async resolveAppVersionID(APPID, appVerId, platform) {
    const explicit = String(appVerId || '').trim();
    if (explicit || !isAppleTVPlatform(platform)) return explicit;
    return await this.lookupTVVersion(APPID, {country: process.env.IPA_APP_COUNTRY || 'us'});
}

async validateDownloadedPackage(platform) {
    try {
        await this.validatePackage(this.out, platform);
    } catch (error) {
        await fsPromises.unlink(this.out).catch(() => {});
        throw error;
    }
}
```

- [ ] **Step 4: 把解析后的版本 ID 用于许可、AppInfo 和下载**

将 `runDownload` 签名改为：

```js
async runDownload({dir = '.', APPID, appVerId, platform = 'iphone'} = {})
```

在创建下载临时目录后先得到 `resolvedVersionID`，并把它传给 `Store.purchase` 和 `this.info`。MD5 下载完成后、`SignatureClient.sign` 之前调用：

```js
await this.validateDownloadedPackage(platform);
```

临时目录前缀改为 `idapastel-download-parts-`。

- [ ] **Step 5: 让 Apple TV 版本列表只返回已验证的最新 ID**

将 `listVersionIds(APPID, platform = 'iphone')` 和 `_listVersionIdsOnce(APPID, platform)` 接受平台参数。Apple TV 模式先解析 `resolvedVersionID`，所有 `Store.AppInfo` 和缺少许可后的 `Store.purchase` 都使用该 ID；返回：

```js
{
    appId: String(APPID),
    name: meta.bundleDisplayName || 'UnknownApp',
    latestVersion: meta.bundleShortVersionString || '',
    latestVersionId: resolvedVersionID,
    versionIds: [resolvedVersionID],
    platform: 'appletv',
}
```

非 Apple TV 保留原有完整版本 ID 数组。

- [ ] **Step 6: 从 main.js 传递平台**

```js
const platform = process.env.DOWNLOAD_PLATFORM || 'iphone';

if (process.env.IPA_LIST_VERSION_IDS) {
    const result = await app.listVersionIds(requiredEnv('DOWNLOAD_APPID'), platform);
    printJSON(result);
    console.log(t('all_done'));
    return;
}

await app.run({
    dir: process.env.DOWNLOAD_DIR || './app',
    APPID: requiredEnv('DOWNLOAD_APPID'),
    appVerId: process.env.DOWNLOAD_VERSION_ID || '',
    platform,
});
```

- [ ] **Step 7: 增加明确的 tvOS 多语言错误**

在 `i18n.js` 各语言区增加同一组 Key：

```js
tvos_no_app: 'Apple TV 版本查询失败：未找到此 App。',
tvos_no_offer: 'Apple TV 版本查询失败：此 App 没有 tvOS 版本。',
tvos_no_version: 'Apple TV 版本查询失败：未获得外部版本 ID。',
tvos_wrong_platform: '包校验失败：Apple 返回的文件不支持 AppleTVOS。',
tvos_info_missing: '包校验失败：未找到主 App 的 Info.plist。',
tvos_info_invalid: '包校验失败：主 App 的 Info.plist 无法解析。',
```

其余语言使用以下精确值：

```js
// zh-Hant
tvos_no_app: 'Apple TV 版本查詢失敗：找不到此 App。',
tvos_no_offer: 'Apple TV 版本查詢失敗：此 App 沒有 tvOS 版本。',
tvos_no_version: 'Apple TV 版本查詢失敗：未取得外部版本 ID。',
tvos_wrong_platform: '套件驗證失敗：Apple 傳回的檔案不支援 AppleTVOS。',
tvos_info_missing: '套件驗證失敗：找不到主 App 的 Info.plist。',
tvos_info_invalid: '套件驗證失敗：無法解析主 App 的 Info.plist。',

// ja
tvos_no_app: 'Apple TV のバージョン検索に失敗：この App が見つかりません。',
tvos_no_offer: 'Apple TV のバージョン検索に失敗：この App には tvOS バージョンがありません。',
tvos_no_version: 'Apple TV のバージョン検索に失敗：外部バージョン ID を取得できませんでした。',
tvos_wrong_platform: 'パッケージ検証に失敗：Apple から返されたファイルは AppleTVOS に対応していません。',
tvos_info_missing: 'パッケージ検証に失敗：メイン App の Info.plist が見つかりません。',
tvos_info_invalid: 'パッケージ検証に失敗：メイン App の Info.plist を解析できません。',

// ko
tvos_no_app: 'Apple TV 버전 조회 실패: 이 App을 찾을 수 없습니다.',
tvos_no_offer: 'Apple TV 버전 조회 실패: 이 App의 tvOS 버전이 없습니다.',
tvos_no_version: 'Apple TV 버전 조회 실패: 외부 버전 ID를 가져오지 못했습니다.',
tvos_wrong_platform: '패키지 검증 실패: Apple에서 반환한 파일은 AppleTVOS를 지원하지 않습니다.',
tvos_info_missing: '패키지 검증 실패: 기본 App의 Info.plist를 찾을 수 없습니다.',
tvos_info_invalid: '패키지 검증 실패: 기본 App의 Info.plist를 파싱할 수 없습니다.',

// th
tvos_no_app: 'การค้นหาเวอร์ชัน Apple TV ล้มเหลว: ไม่พบแอปนี้',
tvos_no_offer: 'การค้นหาเวอร์ชัน Apple TV ล้มเหลว: แอปนี้ไม่มีเวอร์ชัน tvOS',
tvos_no_version: 'การค้นหาเวอร์ชัน Apple TV ล้มเหลว: ไม่พบ ID เวอร์ชันภายนอก',
tvos_wrong_platform: 'การตรวจสอบแพ็กเกจล้มเหลว: ไฟล์ที่ Apple ส่งกลับไม่รองรับ AppleTVOS',
tvos_info_missing: 'การตรวจสอบแพ็กเกจล้มเหลว: ไม่พบ Info.plist ของแอปหลัก',
tvos_info_invalid: 'การตรวจสอบแพ็กเกจล้มเหลว: ไม่สามารถอ่าน Info.plist ของแอปหลักได้',
```

不得回退为账户或认证错误。`tvos-version.js` 和 `package-platform.js` 的 Error Code 保持不变，`ipa.js` 在边界处使用以下映射：

```js
const TVOS_ERROR_KEYS = Object.freeze({
    TVOS_NO_APP: 'tvos_no_app',
    TVOS_NO_OFFER: 'tvos_no_offer',
    TVOS_NO_VERSION: 'tvos_no_version',
    TVOS_PLATFORM_MISMATCH: 'tvos_wrong_platform',
    TVOS_INFO_MISSING: 'tvos_info_missing',
    TVOS_INFO_INVALID: 'tvos_info_invalid',
});

function localizedTVError(error) {
    const key = TVOS_ERROR_KEYS[error?.code];
    if (!key) return error;
    const localized = new Error(t(key));
    localized.code = error.code;
    return localized;
}
```

在 `resolveAppVersionID` 和 `validateDownloadedPackage` 捕获模块错误后 `throw localizedTVError(error)`，保留机器错误码并替换用户文案。

- [ ] **Step 8: 运行集成和全量测试**

Run:

```bash
cd NodeProject
node --test test/tvos-download-flow.test.js
npm test
```

Expected: 全部 PASS；不需要 Apple 账户或网络。

- [ ] **Step 9: 提交下载引擎集成**

```bash
git add NodeProject/main.js NodeProject/src/ipa.js NodeProject/src/i18n.js NodeProject/test/tvos-download-flow.test.js
git commit -m "feat: integrate tvOS download flow"
```

---

### Task 6: SwiftUI Apple TV 平台与下载行为

**Files:**
- Modify: `Pastel/PastelApp.swift:737-750,1377-1437,1552-1683,1801-1955,2779-3305,4630-4790,5070-5227,5626-5745,6050-7040`
- Modify: `Pastel/Localizable.xcstrings`
- Test: Xcode Release build plus source assertions

**Interfaces:**
- Consumes: Node 平台字符串 `appletv` 和环境变量 `DOWNLOAD_PLATFORM`。
- Produces: `AppSearchPlatform.appleTV`、`RunConfig.platform`、Apple-only TV UI、下载记录 TV 标记和无 AirDrop TV 行为。

- [ ] **Step 1: 添加源代码断言并确认当前失败**

Run:

```bash
rg -n 'case appleTV|DOWNLOAD_PLATFORM|isAppleTVApp' Pastel/PastelApp.swift
```

Expected: FAIL 或无输出，当前 Swift 不包含 Apple TV 平台。

- [ ] **Step 2: 增加 Apple TV 枚举和模型属性**

```swift
private enum AppSearchPlatform: String, CaseIterable, Identifiable {
    case iphone
    case ipad
    case vision
    case appleTV = "appletv"

    var id: String { rawValue }

    var symbolName: String {
        switch self {
        case .iphone: return "iphone"
        case .ipad: return "ipad"
        case .vision: return "vision.pro"
        case .appleTV: return "appletv"
        }
    }

    var title: String {
        switch self {
        case .iphone: return "iPhone"
        case .ipad: return "iPad"
        case .vision: return "Vision"
        case .appleTV: return "Apple TV"
        }
    }
}
```

为 `AppSearchResult` 和 `DownloadedItem` 增加：

```swift
var isAppleTVApp: Bool {
    let value = (platform ?? "").lowercased()
    return value == "appletv" || value.contains("appletvos") || value.contains("tvos")
}
```

`DownloadedItem` 使用 `softwarePlatform` 实现同名属性，`DownloadedAppGroup` 转发首项结果。

- [ ] **Step 3: 将平台写入 Node 下载环境**

在 `RunConfig` 增加：

```swift
var platform: String = AppSearchPlatform.iphone.rawValue
```

在 `DownloadManager.start` 增加：

```swift
env["DOWNLOAD_PLATFORM"] = config.platform
```

所有下载和版本查询配置使用 `selectedSearchPlatform.rawValue`；手动下载也继承当前平台。

- [ ] **Step 4: 实现 Apple TV 搜索空状态和 Apple-only 来源**

`CatalogViewModel.loadFeatured()` 在 `appletv` 模式不调用 RSS：

```swift
if platform == AppSearchPlatform.appleTV.rawValue {
    searchResults = []
    isSearching = false
    isShowingFeatured = false
    canLoadMoreFeatured = false
    searchStatus = String(localized: "Apple TV 暂无推荐榜单，请搜索 App 或输入 App ID。")
    return
}
```

新增 `activeAppIsAppleTV` 和 `activeAppRequiresAppleSource`。Apple TV 或 Vision 激活时，`historyProvider` 固定为 `apple`；第三方来源控件禁用。Apple TV 模式的版本结果只展示 Node 返回的最新 ID，隐藏“全部下载”。

- [ ] **Step 5: 传播搜索结果和已下载记录的平台**

选择 Apple TV 搜索结果、从已下载项恢复搜索、或从分组恢复时，都设置：

```swift
selectedSearchPlatformID = AppSearchPlatform.appleTV.rawValue
catalog.platform = AppSearchPlatform.appleTV.rawValue
catalog.historyProvider = "apple"
```

下载配置固定传递当前选中平台；解析下载元数据时将 Apple 的 `AppleTVOS`、`appletv` 或 `tvos` 统一展示为 Apple TV。

- [ ] **Step 6: 禁止 TV 行使用 AirDrop 安装动作**

为文件操作组件增加显式参数：

```swift
let allowsAirDrop: Bool
```

只有 `allowsAirDrop` 为真时才渲染 AirDrop 按钮。Apple TV 下载项和分组传入 `false`，iPhone/iPad/Vision 保持现有行为。

- [ ] **Step 7: 添加本地化文案**

在 String Catalog 增加这些源字符串并提供简体中文、繁体中文、日语、韩语和泰语翻译：

```text
Apple TV 暂无推荐榜单，请搜索 App 或输入 App ID。
Apple TV 目前仅提供 Apple 来源的最新版本或手动版本 ID。
Apple 返回的不是 tvOS 安装包。
Apple TV 安装需要使用其他设备管理工具。
```

String Catalog 使用下表中的精确翻译：

| 简体中文源字符串 | 繁体中文 | 日语 | 韩语 | 泰语 |
|---|---|---|---|---|
| Apple TV 暂无推荐榜单，请搜索 App 或输入 App ID。 | Apple TV 暫無推薦排行榜，請搜尋 App 或輸入 App ID。 | Apple TV のおすすめランキングは現在利用できません。App を検索するか App ID を入力してください。 | Apple TV 추천 순위는 현재 제공되지 않습니다. App을 검색하거나 App ID를 입력하세요. | ขณะนี้ไม่มีรายการแนะนำสำหรับ Apple TV โปรดค้นหาแอปหรือป้อน App ID |
| Apple TV 目前仅提供 Apple 来源的最新版本或手动版本 ID。 | Apple TV 目前僅提供 Apple 來源的最新版本或手動版本 ID。 | Apple TV では現在、Apple から取得した最新バージョンまたは手動入力したバージョン ID のみ利用できます。 | Apple TV는 현재 Apple에서 가져온 최신 버전 또는 수동 버전 ID만 제공합니다. | ขณะนี้ Apple TV รองรับเฉพาะเวอร์ชันล่าสุดจาก Apple หรือ ID เวอร์ชันที่ป้อนด้วยตนเอง |
| Apple 返回的不是 tvOS 安装包。 | Apple 傳回的不是 tvOS 安裝套件。 | Apple から返されたファイルは tvOS インストールパッケージではありません。 | Apple에서 반환한 파일은 tvOS 설치 패키지가 아닙니다. | ไฟล์ที่ Apple ส่งกลับไม่ใช่แพ็กเกจติดตั้ง tvOS |
| Apple TV 安装需要使用其他设备管理工具。 | Apple TV 安裝需要使用其他裝置管理工具。 | Apple TV へのインストールには別のデバイス管理ツールが必要です。 | Apple TV에 설치하려면 다른 기기 관리 도구가 필요합니다. | การติดตั้งบน Apple TV ต้องใช้เครื่องมือจัดการอุปกรณ์อื่น |

不得把新文案误用为 iPhone、iPad 或 Vision 的通用状态。

- [ ] **Step 8: 编译并检查平台连接**

Run:

```bash
rg -n 'case appleTV|DOWNLOAD_PLATFORM|isAppleTVApp' Pastel/PastelApp.swift
xcodebuild -project Pastel.xcodeproj -scheme IDAPastel -configuration Release -derivedDataPath .build/idapastel CODE_SIGN_IDENTITY=- build
Scripts/VerifyIDAPastelApp.sh .build/idapastel/Build/Products/Release/IDAPastel.app
```

Expected: `rg` 命中三类连接点；Xcode BUILD SUCCEEDED；App 验证 PASS。

- [ ] **Step 9: 提交 SwiftUI Apple TV 功能**

```bash
git add Pastel/PastelApp.swift Pastel/Localizable.xcstrings
git commit -m "feat: add Apple TV workflow to IDAPastel"
```

---

### Task 7: 用户文档、限制说明和来源署名

**Files:**
- Create: `README-IDAPastel.md`
- Modify: `README.md:1-56`
- Modify: `Pastel/PastelApp.swift:8128-8235`
- Test: documentation assertions

**Interfaces:**
- Consumes: 已实现的产品名称、功能边界和 Ad Hoc 分发方式。
- Produces: 自用安装说明、TV 功能边界、上游同步说明和 `majd/ipatool` MIT 署名。

- [ ] **Step 1: 编写 IDAPastel 文档**

文档必须包含以下具体章节：

```markdown
# IDAPastel

## 与 Pastel 的关系
IDAPastel 维护在 `tv` 分支，使用独立 Bundle ID 和本地数据，不覆盖 Pastel。

## Apple TV 第一版能力
- 搜索和 App ID 查找
- 最新 tvOS 包
- 手动外部版本 ID
- AppleTVOS 下载后校验

## 不包含的能力
- 完整 tvOS 历史版本
- Apple TV 自动安装
- 第三方 TV 历史数据

## 安装 DMG
将 IDAPastel.app 拖入 Applications。首次运行使用右键“打开”；如被阻止，在系统设置的“隐私与安全性”中选择“仍要打开”。

## 来源
tvOS 下载方法参考 MIT 许可的 majd/ipatool 与 https://github.com/majd/ipatool/pull/478 。
```

再写明仅支持 Apple 芯片和 macOS 26+，以及仅对自己确认可信的构建使用：

```bash
xattr -dr com.apple.quarantine /Applications/IDAPastel.app
```

- [ ] **Step 2: 在主 README 和“关于”页面增加入口**

主 README 顶部增加指向 `README-IDAPastel.md` 的说明，不改写上游全部内容。“关于”页面保留原作者信息，同时新增 `majd/ipatool` 和 PR #478 链接，不将 IDAPastel 误称为原作者官方版本。

- [ ] **Step 3: 验证文档关键约束**

Run:

```bash
rg -n 'IDAPastel|AppleTVOS|ipatool|PR #478|macOS 26|Ad Hoc|quarantine' README-IDAPastel.md README.md Pastel/PastelApp.swift
```

Expected: 每个关键约束至少命中一次。

- [ ] **Step 4: 提交文档和署名**

```bash
git add README.md README-IDAPastel.md Pastel/PastelApp.swift
git commit -m "docs: explain IDAPastel tvOS distribution"
```

---

### Task 8: 锁定 Node 依赖并实现本机 DMG 脚本

**Files:**
- Create: `NodeProject/package-lock.json`
- Create: `Scripts/BuildIDAPastelDMG.sh`
- Create: `Scripts/VerifyIDAPastelDMG.sh`
- Modify: `Scripts/VerifyIDAPastelApp.sh`
- Test: all three scripts

**Interfaces:**
- Consumes: `.build/idapastel/Build/Products/Release/IDAPastel.app`。
- Produces: `dist/IDAPastel-<version>-arm64.dmg` 和同名 `.sha256`。

- [ ] **Step 1: 生成依赖锁并验证可重复安装**

Run:

```bash
npm install --prefix NodeProject --package-lock-only --ignore-scripts
npm ci --prefix NodeProject
npm test --prefix NodeProject
```

Expected: 生成 `NodeProject/package-lock.json`；`npm ci` 和全部 Node 测试 PASS。

- [ ] **Step 2: 编写 DMG 构建脚本**

```bash
#!/bin/bash
set -euo pipefail

app_path="${1:?usage: BuildIDAPastelDMG.sh /Applications/IDAPastel.app dist}"
output_dir="${2:?usage: BuildIDAPastelDMG.sh /Applications/IDAPastel.app dist}"
info_plist="$app_path/Contents/Info.plist"
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$info_plist")
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/idapastel-dmg.XXXXXX")
stage_dir="$work_dir/stage"

cleanup() { rm -rf "$work_dir"; }
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
```

- [ ] **Step 3: 编写 DMG 验证脚本**

```bash
#!/bin/bash
set -euo pipefail

dmg_path="${1:?usage: VerifyIDAPastelDMG.sh dist/IDAPastel.dmg}"
mount_dir=$(mktemp -d "${TMPDIR:-/tmp}/idapastel-mount.XXXXXX")

cleanup() {
    hdiutil detach "$mount_dir" -quiet >/dev/null 2>&1 || true
    rmdir "$mount_dir" >/dev/null 2>&1 || true
}
trap cleanup EXIT

hdiutil attach "$dmg_path" -readonly -nobrowse -mountpoint "$mount_dir" -quiet
test -L "$mount_dir/Applications"
Scripts/VerifyIDAPastelApp.sh "$mount_dir/IDAPastel.app"
(
    cd "$(dirname "$dmg_path")"
    shasum -a 256 -c "$(basename "$dmg_path").sha256"
)
```

Run:

```bash
chmod +x Scripts/BuildIDAPastelDMG.sh Scripts/VerifyIDAPastelDMG.sh
```

- [ ] **Step 4: 构建、打包和挂载验证**

Run:

```bash
rm -rf .build/idapastel dist
xcodebuild -project Pastel.xcodeproj -scheme IDAPastel -configuration Release -derivedDataPath .build/idapastel CODE_SIGN_IDENTITY=- build
Scripts/VerifyIDAPastelApp.sh .build/idapastel/Build/Products/Release/IDAPastel.app
Scripts/BuildIDAPastelDMG.sh .build/idapastel/Build/Products/Release/IDAPastel.app dist
Scripts/VerifyIDAPastelDMG.sh "$(find dist -name 'IDAPastel-*-arm64.dmg' -print -quit)"
```

Expected: BUILD SUCCEEDED；App 验证、DMG 挂载和 SHA-256 校验全部 PASS。

- [ ] **Step 5: 提交锁文件和脚本**

```bash
git add NodeProject/package-lock.json Scripts/BuildIDAPastelDMG.sh Scripts/VerifyIDAPastelApp.sh Scripts/VerifyIDAPastelDMG.sh
git commit -m "build: add reproducible IDAPastel DMG packaging"
```

---

### Task 9: GitHub Actions 构建、Artifact 和 Tag Release

**Files:**
- Create: `.github/workflows/build-idapastel-dmg.yml`
- Test: YAML parse plus local command parity

**Interfaces:**
- Consumes: `npm ci`、Node 测试、Xcode Target `Pastel` 和 Task 8 的三个脚本。
- Produces: Actions Artifact；`idapastel-v*` Tag 时通过 `GITHUB_TOKEN` 创建 Release。

- [ ] **Step 1: 新增工作流**

```yaml
name: Build IDAPastel DMG

on:
  push:
    branches: [tv]
    tags: ['idapastel-v*']
  pull_request:
    branches: [tv]
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: idapastel-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: macos-26
    steps:
      - uses: actions/checkout@v4

      - name: Verify runner
        run: |
          test "$(uname -m)" = "arm64"
          xcodebuild -version | tee xcode-version.txt
          grep -q '^Xcode 26\.' xcode-version.txt

      - name: Install Node dependencies
        run: npm ci --prefix NodeProject

      - name: Test Node engine
        run: npm test --prefix NodeProject

      - name: Build IDAPastel
        run: |
          xcodebuild -project Pastel.xcodeproj \
            -scheme IDAPastel \
            -configuration Release \
            -derivedDataPath "$RUNNER_TEMP/DerivedData" \
            CODE_SIGN_IDENTITY=- \
            build

      - name: Verify and package
        run: |
          app="$RUNNER_TEMP/DerivedData/Build/Products/Release/IDAPastel.app"
          Scripts/VerifyIDAPastelApp.sh "$app"
          Scripts/BuildIDAPastelDMG.sh "$app" dist
          dmg=$(find dist -name 'IDAPastel-*-arm64.dmg' -print -quit)
          Scripts/VerifyIDAPastelDMG.sh "$dmg"

      - uses: actions/upload-artifact@v4
        with:
          name: IDAPastel-arm64
          path: |
            dist/*.dmg
            dist/*.sha256
          retention-days: 14

      - name: Publish GitHub Release
        if: startsWith(github.ref, 'refs/tags/idapastel-v')
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release create "$GITHUB_REF_NAME" dist/*.dmg dist/*.sha256 --generate-notes --title "IDAPastel $GITHUB_REF_NAME"
```

- [ ] **Step 2: 静态解析 YAML**

Run:

```bash
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/build-idapastel-dmg.yml"); puts "workflow yaml ok"'
rg -n 'macos-26|npm ci|npm test|CODE_SIGN_IDENTITY=-|upload-artifact|gh release create' .github/workflows/build-idapastel-dmg.yml
```

Expected: 输出 `workflow yaml ok`，且每个关键步骤都被命中。

- [ ] **Step 3: 在本机执行与 Actions 相同的核心命令**

Run:

```bash
npm ci --prefix NodeProject
npm test --prefix NodeProject
rm -rf .build/idapastel dist
xcodebuild -project Pastel.xcodeproj -scheme IDAPastel -configuration Release -derivedDataPath .build/idapastel CODE_SIGN_IDENTITY=- build
Scripts/VerifyIDAPastelApp.sh .build/idapastel/Build/Products/Release/IDAPastel.app
Scripts/BuildIDAPastelDMG.sh .build/idapastel/Build/Products/Release/IDAPastel.app dist
Scripts/VerifyIDAPastelDMG.sh "$(find dist -name 'IDAPastel-*-arm64.dmg' -print -quit)"
```

Expected: 全部 PASS。本步骤不创建 Tag、不调用 `gh release create`。

- [ ] **Step 4: 提交 Actions**

```bash
git add .github/workflows/build-idapastel-dmg.yml
git commit -m "ci: build IDAPastel DMG on tv branch"
```

---

### Task 10: 全量回归和人工端到端验收

**Files:**
- Verify: all implementation files from Tasks 1-9
- Verify: `docs/superpowers/specs/2026-08-29-idapastel-tvos-design-zh-CN.md`
- Verify: `README-IDAPastel.md`

**Interfaces:**
- Consumes: 完整 IDAPastel 实现和本机 Apple 账户。
- Produces: 自动测试证据、可安装 DMG，以及明确记录的人工 TV 下载结果。

- [ ] **Step 1: 运行无凭据全量验证**

Run:

```bash
npm ci --prefix NodeProject
npm test --prefix NodeProject
rm -rf .build/idapastel dist
xcodebuild -project Pastel.xcodeproj -scheme IDAPastel -configuration Release -derivedDataPath .build/idapastel CODE_SIGN_IDENTITY=- build
Scripts/VerifyIDAPastelApp.sh .build/idapastel/Build/Products/Release/IDAPastel.app
Scripts/BuildIDAPastelDMG.sh .build/idapastel/Build/Products/Release/IDAPastel.app dist
Scripts/VerifyIDAPastelDMG.sh "$(find dist -name 'IDAPastel-*-arm64.dmg' -print -quit)"
git diff --check main..tv
```

Expected: Node 测试 0 失败；Xcode BUILD SUCCEEDED；App、DMG、SHA-256 验证 PASS；Git Diff 无空白错误。

- [ ] **Step 2: 检查产品数据隔离**

安装 DMG 后同时运行 Pastel 和 IDAPastel，确认：

```text
/Applications/Pastel.app
/Applications/IDAPastel.app
~/Library/Application Support/Pastel
~/Library/Application Support/IDAPastel
~/Downloads/IDAPastel
```

在 IDAPastel 添加测试账户后，Pastel 的账户列表不得出现该账户。Keychain Access 中两个 App 使用不同 Service 名。

- [ ] **Step 3: 使用免费 Apple TV App 做真实下载**

在 IDAPastel 中选择 Apple TV，搜索免费 TV App，执行最新版本下载。完成后检查：

```bash
read -r -p "Downloaded IPA absolute path: " ipa_path
test -f "$ipa_path"
temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/idapastel-tv-check.XXXXXX")
unzip -q "$ipa_path" -d "$temp_dir"
plutil -p "$temp_dir"/Payload/*.app/Info.plist | rg 'AppleTVOS'
rm -rf "$temp_dir"
```

Expected: 命中 `AppleTVOS`。随后用一个已知外部版本 ID 重复下载，仍通过平台校验。

- [ ] **Step 4: 验证错误平台清理**

用单元测试 Fixture 或注入 Validator 触发 `TVOS_PLATFORM_MISMATCH`，确认下载目录没有残留错误 IPA，UI 显示 tvOS 平台不匹配错误，而不是认证失败。

- [ ] **Step 5: 核对分支和提交历史**

Run:

```bash
git status --short --branch
git log --oneline --decorate main..tv
git diff --name-status main..tv
```

Expected: 当前分支是 `tv`；工作区干净；`main..tv` 只包含设计、IDAPastel、tvOS、测试、文档和 Actions 相关提交。

- [ ] **Step 6: 保留人工验收事实，不伪造 CI 结果**

如果真实 Apple 账户测试无法在执行环境完成，交付说明必须明确写为“自动测试与 DMG 验证通过，真实 Apple TV 下载等待用户本机验证”，不得把单元测试描述成真实 App Store 下载成功。
