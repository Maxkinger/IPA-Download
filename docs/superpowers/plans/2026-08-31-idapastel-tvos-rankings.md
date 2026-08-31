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
