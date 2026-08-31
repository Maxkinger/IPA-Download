# IDAPastel tvOS Apple History Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 安全地验证 Apple StoreServices 是否能利用最新 tvOS 外部版本 ID 返回同一 tvOS 版本族，无需引入数据库。

**Architecture:** 保留现有 `atv9 -> latestVersionId -> Store.AppInfo` 流程，只改变 Apple TV 的版本列表判定。返回列表必须包含已知最新 tvOS ID 才会被接受，否则维持现有单一最新版本回退；Swift UI 暂不启用历史列表。

**Tech Stack:** Node.js ESM、`node:test`、Apple StoreServices plist 元数据。

**Spec:** `docs/superpowers/specs/2026-08-31-idapastel-tvos-history-spike.md`

## Global Constraints

- 所有实现提交只进入 `tv`；不得在 `main` 上提交产品改动。
- 不新增数据库、网络服务、第三方历史源或运行时依赖。
- Apple TV 历史列表只有在 `softwareVersionExternalIdentifiers` 包含 `atv9` 解析出的最新 tvOS ID 时才可信。
- Apple 返回空列表或不相关列表时，`versionIds` 必须回退为仅包含最新 tvOS ID。
- 不修改 Swift UI；凭据化验证前继续只向用户显示最新 Apple TV 版本。
- iPhone、iPad、Vision、下载、购买、认证和 IPA 平台校验行为不得改变。
- 仓库和测试中不得保存真实 Apple 账户凭据、Cookie、Token 或原始认证响应。

---

## File Structure

- `NodeProject/test/tvos-download-flow.test.js`：用 StoreServices 夹具证明可信版本族和安全回退。
- `NodeProject/src/ipa.js`：为 Apple TV 接受经过最新 tvOS ID 锚定的历史版本族。

---

### Task 1: 安全枚举 Apple TV 版本族

**Files:**
- Modify: `NodeProject/test/tvos-download-flow.test.js`
- Modify: `NodeProject/src/ipa.js:261-299`

**Interfaces:**
- Consumes: `resolveAppVersionID(APPID, "", "appletv") -> String` 和 `metadata.softwareVersionExternalIdentifiers`。
- Produces: `listVersionIds(APPID, "appletv") -> { appId, name, latestVersion, latestVersionId, versionIds, platform }`，其中 `versionIds` 仅在包含 `latestVersionId` 时接受 Apple 返回的完整列表。

- [ ] **Step 1: 编写可信 tvOS 版本族的失败测试**

在 `NodeProject/test/tvos-download-flow.test.js` 导入 `Store`，临时替换并在 `finally` 中恢复 `Store.AppInfo`。构造 `softwareVersionExternalIdentifiers: [700, "800", "900", "900"]`，令 `resolveAppVersionID()` 返回 `"900"`，断言 Apple TV 结果为：

```js
assert.equal(result.latestVersionId, '900');
assert.deepEqual(result.versionIds, ['700', '800', '900']);
assert.equal(result.platform, 'appletv');
```

- [ ] **Step 2: 运行测试并确认因现有单版本行为而失败**

Run:

```bash
cd NodeProject && node --test test/tvos-download-flow.test.js
```

Expected: FAIL，`versionIds` 实际仍为 `["900"]`。

- [ ] **Step 3: 编写不相关版本族的安全回退失败测试**

构造 `softwareVersionExternalIdentifiers: [100, "200"]`，同时令已解析的最新 tvOS ID 为 `"900"`，断言：

```js
assert.deepEqual(result.versionIds, ['900']);
```

此测试捕获将 iOS 版本族误暴露为 tvOS 历史的回归。

- [ ] **Step 4: 实现最小 Apple TV 版本族判定**

在 `NodeProject/src/ipa.js` 的 Apple TV 分支中：

```js
const normalizedTVIDs = [...new Set(
    ids.map(id => String(id).trim()).filter(Boolean)
)];
const versionIds = normalizedTVIDs.includes(String(resolvedVersionID))
    ? normalizedTVIDs
    : [String(resolvedVersionID)];
```

返回现有字段，并将 Apple TV 的 `versionIds` 改为上述安全结果。不得改变非 Apple TV 分支。

- [ ] **Step 5: 运行聚焦测试和 Node 全量测试**

Run:

```bash
cd NodeProject && node --test test/tvos-download-flow.test.js
cd NodeProject && npm test
```

Expected: 两个命令均 PASS，且全量测试无 warning/error。

- [ ] **Step 6: 自检并提交**

确认 diff 只包含计划、设计、测试和 Apple TV 版本族判定，然后提交：

```bash
git add docs/superpowers/specs/2026-08-31-idapastel-tvos-history-spike.md docs/superpowers/plans/2026-08-31-idapastel-tvos-history-spike.md NodeProject/test/tvos-download-flow.test.js NodeProject/src/ipa.js
git commit -m "feat: probe Apple TV version history"
```
