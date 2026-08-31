# IDAPastel Apple TV 榜单实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `tv` 分支为 IDAPastel 增加 Apple TV Top Free/Top Paid 榜单，并保持中国区禁用与非 TV 平台行为不变。

**Architecture:** Node 侧从 Apple TV 官方 Store 网页的 `/tv/discover` 页面提取 Top Free 和 Top Paid shelf 中的 App ID，再复用现有 `tvSoftware` lookup 补全元数据；解析器与请求编排分离并可注入 HTTP client 测试。Swift 侧移除 Apple TV featured 的提前返回，让现有 featured 请求、分页和错误状态复用 Node 榜单结果。

**Tech Stack:** Node.js ESM、node:test、axios、SwiftUI、现有 Xcode 工程。

**Spec:** `docs/superpowers/specs/2026-08-29-idapastel-tvos-design-zh-CN.md`（Apple TV 搜索/查找平台约束；本计划扩展其首页榜单实现）。

## Global Constraints

- 所有实现提交只进入 `tv`；不得切换到 `main` 提交产品改动。
- 中国区没有 Apple TV Store，`cn` 的 Apple TV tab 继续禁用。
- Apple TV 榜单只能使用 Apple TV 网页中的 App ID，并通过 `tvSoftware` lookup 补全；不得回退到 iPhone/iPad RSS 榜单。
- 榜单网页结构变化或请求失败时返回可处理的空结果/错误，不得展示 iPhone 榜单冒充 TV 榜单。
- 现有 iPhone、iPad、Vision 搜索和榜单行为不得回归。
- 所有 Node HTTP 请求必须支持测试注入 client；不得在测试中访问 Apple 网络。

### Task 1: Apple TV 榜单解析与 Node featured 接入

**Files:**
- Create: `NodeProject/src/tvos-ranking.js`
- Create: `NodeProject/test/tvos-ranking.test.js`
- Modify: `NodeProject/src/catalog.js:299-401,534`
- Test: `NodeProject/test/catalog.test.js`

**Interfaces:**
- Produces `buildTVDiscoverURL(country)`, `extractTVChartAppIds(html, chart, limit)`, `extractTVRankingAppIds(html, limit)`。
- `featuredApps({country, platform:'appletv', limit, offset, client})` 请求 Apple TV discover 页面，按 Top Free 后 Top Paid 顺序提取并去重，再调用现有 `lookupAppsByIds(..., platform:'appletv')`；返回现有 featured 响应结构。

- [ ] **Step 1: Write failing tests**

测试 fixture 必须包含两个有序 shelf、重复 App ID、非 shelf 链接和带 `?platform=tv` 的 App Store 链接；断言：

```js
test('extracts top free and paid IDs in shelf order', () => {
    const html = `
      <a href="/us/app/outside/id999">outside</a>
      <section data-test-id="shelf-wrapper" aria-label="Top Free">
        <a href="https://apps.apple.com/us/app/free-one/id111?platform=tv">one</a>
        <a href="https://apps.apple.com/us/app/shared/id333?platform=tv">shared</a>
      </section>
      <section data-test-id="shelf-wrapper" aria-label="Top Paid">
        <a href="https://apps.apple.com/us/app/shared/id333?platform=tv">shared</a>
        <a href="https://apps.apple.com/us/app/paid-one/id222?platform=tv">paid</a>
      </section>`;
    assert.deepEqual(extractTVChartAppIds(html, 'top-free', 10), ['111', '333']);
    assert.deepEqual(extractTVChartAppIds(html, 'top-paid', 10), ['333', '222']);
    assert.deepEqual(extractTVRankingAppIds(html, 10), ['111', '333', '222']);
});

test('builds the official discover URL and limits IDs', () => {
    assert.equal(buildTVDiscoverURL('US'), 'https://apps.apple.com/us/tv/discover');
    assert.deepEqual(extractTVRankingAppIds('<section aria-label="Top Free"><a href="/us/app/a/id111"></a><a href="/us/app/b/id222"></a></section>', 1), ['111']);
});

test('featured Apple TV requests discover then tvSoftware lookup', async () => {
    const requests = [];
    const client = {async get(url, options = {}) {
        requests.push({url, options});
        if (url === 'https://apps.apple.com/us/tv/discover') return {data: '<section aria-label="Top Free"><a href="/us/app/free/id111"></a></section>'};
        assert.equal(url, 'https://itunes.apple.com/lookup');
        assert.equal(options.params.entity, 'tvSoftware');
        return {data: {results: [{trackId: 111, trackName: 'TV App', supportedDevices: ['AppleTV4-AppleTV4']}]}};
    }};
    const response = await featuredApps({country: 'us', platform: 'appletv', limit: 10, offset: 0, client});
    assert.equal(response.count, 1);
    assert.equal(response.results[0].platform, 'appletv');
    assert.deepEqual(requests.map(request => request.url), ['https://apps.apple.com/us/tv/discover', 'https://itunes.apple.com/lookup']);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run `cd NodeProject && node --test test/tvos-ranking.test.js`；Expected：因 `src/tvos-ranking.js` 不存在或 `featuredApps` 仍返回空数组而失败。

- [ ] **Step 3: Implement pure parser and URL builder**

`buildTVDiscoverURL` 将国家代码规范化为小写；`extractTVChartAppIds` 只读取 `aria-label="Top Free"` 或 `"Top Paid"` 的 section，提取其中 `/app/.../id<数字>`，保持页面顺序、去重并应用正整数 limit；`extractTVRankingAppIds` 合并 free 后 paid 并全局去重。

- [ ] **Step 4: Integrate catalog with bounded cache**

在 `catalog.js` 中增加跨 Node CLI 进程可复用的 10 分钟国家级 TV 榜单缓存（默认保存到 `~/Library/Application Support/IDAPastel/tv-ranking-cache.json`，测试可通过显式 cache file 注入），缓存已补全的 TV App 结果；请求使用 `Accept: text/html,application/xhtml+xml`；页面无 shelf 或 lookup 结果为空时返回现有 featured 空结果。`featuredApps` 的 `appletv` 分支按 offset/limit 分页；不触碰 iPhone、iPad、Vision 分支。

- [ ] **Step 5: Run tests and commit**

Run `cd NodeProject && node --test test/tvos-ranking.test.js test/catalog.test.js && npm test`；Expected：全部通过且无网络请求。Commit `feat: add Apple TV featured rankings`。

### Task 2: Swift Apple TV featured UI 接入与回归验证

**Files:**
- Modify: `Pastel/PastelApp.swift:1923-1979`
- Modify: `NodeProject/test/catalog.test.js`（如需补充失败/降级覆盖）
- Test: `xcodebuild -project Pastel.xcodeproj -scheme IDAPastel -configuration Debug -derivedDataPath .build/idapastel-ranking CODE_SIGN_IDENTITY=- build`

**Interfaces:**
- Consumes Node `featured` 的既有 `SearchResponse`（含 `queryType`, `count`, `offset`, `limit`, `hasMore`, `results`）。
- Produces Apple TV 非中国 storefront 下的榜单展示、分页和错误状态；中国区仍由现有 availability gate 禁用。

- [ ] **Step 1: Write failing regression check**

在 `PastelApp.swift` 的静态源码回归测试/检查中断言 `loadFeatured()` 不再包含 Apple TV 立即返回“暂无推荐榜单”的分支，并保留 `NodeRuntime.runJSON` 的 `featured` 调用；先运行检查确认当前源码失败。

- [ ] **Step 2: Remove the TV early return**

删除 `if platform == AppSearchPlatform.appleTV.rawValue { ... return }`，让 Apple TV 和其他可用平台共用现有重试、分页和错误处理。不得修改 `AppStorePlatformAvailability`，中国区仍不可点击。

- [ ] **Step 3: Run Swift and Node verification**

运行 `cd NodeProject && npm test`，再运行上述 `xcodebuild`；Expected：Node 全部通过，Xcode Debug 构建成功。

- [ ] **Step 4: Commit**

Commit `feat: show Apple TV featured rankings`。

### Task 3: 兼容本地化 TV 榜单页面

**Files:**
- Modify: `NodeProject/src/tvos-ranking.js`
- Modify: `NodeProject/test/tvos-ranking.test.js`
- Modify: `NodeProject/test/catalog.test.js`

**Interfaces:**
- `buildTVDiscoverURL(country)` 在 discover URL 上追加 `l=en-GB`，让 Apple 尽量返回稳定的英文 shelf 标签。
- `extractTVChartAppIds` 仍支持 `Top Free`/`Top Paid`，并额外通过 shelf 内的官方 `/tv/charts/36?chart=top-free|top-paid` 链接识别本地化标签（例如香港的 `免費 App 排行`/`付費排行`、日本语标签）。

- [ ] **Step 1: Write failing tests**

新增香港/日本本地化 fixture：section 的 `aria-label` 使用本地化文本，但内部保留对应 chart href；断言两种榜单仍能按顺序提取，并断言 URL 包含 `l=en-GB`。新增注入 client featured 测试断言请求的 discover URL 是带语言参数的 URL。

- [ ] **Step 2: Run focused tests and verify RED**

Run `cd NodeProject && node --test test/tvos-ranking.test.js test/catalog.test.js`；Expected：语言参数 URL 断言失败，且本地化 section 解析为空。

- [ ] **Step 3: Implement locale-tolerant discovery**

更新 URL builder 和 shelf 识别逻辑；优先使用 chart href 识别榜单、英文 aria-label 作为兼容回退。不得扩大到普通 App Store 链接或 iPhone RSS。

- [ ] **Step 4: Run verification and commit**

Run `cd NodeProject && npm test`，并用 `node main.js featured --country hk --platform appletv --limit 5` 和 `--country jp` 做真实页面冒烟；Commit `fix: support localized Apple TV rankings`。

### Task 4: 严格图表链接校验与国家切换门禁

**Files:**
- Modify: `NodeProject/src/tvos-ranking.js`
- Modify: `NodeProject/test/tvos-ranking.test.js`
- Modify: `NodeProject/test/catalog.test.js`
- Modify: `Pastel/PastelApp.swift:3496-3510,4836-4849`

**Interfaces:**
- Chart shelf detection accepts only relative or `https://apps.apple.com` links whose pathname is `/{two-letter-country}/tv/charts/36` and whose `chart` query equals the requested chart.
- All country changes, including the country menu and downloaded-app navigation, pass through `applyStorefrontCountry`; selecting China while Apple TV is active must synchronously fall back to iPhone before any catalog request.

- [ ] **Step 1: Write failing tests**

Add parser negative fixtures for a normal app URL whose query contains `/us/tv/charts/36?chart=top-free`, and for an external origin containing the same path; both must return no chart IDs. Add a static Swift regression test that scopes `selectCountry` and `searchForApp` and requires `applyStorefrontCountry` while rejecting direct `selectedCountryCode`/`catalog.country` assignments.

- [ ] **Step 2: Run focused tests and verify RED**

Run `cd NodeProject && node --test test/tvos-ranking.test.js test/catalog.test.js`; Expected: malicious chart-link fixture and Swift country-routing assertions fail against the current implementation.

- [ ] **Step 3: Implement strict href parsing and country routing**

Parse each section `href` with `new URL(href, 'https://apps.apple.com')`; reject absolute URLs whose origin is not exactly `https://apps.apple.com`, require the two-letter storefront path and `searchParams.get('chart')`. Change `selectCountry` and `searchForApp` to call `applyStorefrontCountry` instead of assigning country state directly; preserve account-match selection behavior.

- [ ] **Step 4: Verify and commit**

Run `cd NodeProject && npm test` and `xcodebuild -project Pastel.xcodeproj -scheme IDAPastel -configuration Debug -derivedDataPath .build/idapastel-ranking-gate CODE_SIGN_IDENTITY=- build`; Commit `fix: guard localized TV chart links and storefront changes`。
