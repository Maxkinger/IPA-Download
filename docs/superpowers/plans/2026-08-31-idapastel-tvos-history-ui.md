# IDAPastel tvOS 历史版本展示与下载实施计划

> **For agentic workers:** 使用 `superpowers:subagent-driven-development`，按任务逐项实现、审查并验证。

## Goal

让 Apple TV 版本历史页展示并下载 Apple 返回的全部 tvOS 历史版本；最新版本排在最前，保留明确版本 ID 下载入口。

## Global Constraints

- 所有产品代码只提交到 `tv` 分支。
- 不新增数据库、第三方历史版本源或运行时依赖。
- Node 继续以 `softwareVersionExternalIdentifiers` 为唯一 Apple 历史版本来源；若列表与最新 tvOS ID 不属于同一版本族，仍只返回最新 ID。
- Apple TV 历史版本只能显示 Apple 实际返回的版本 ID；Apple 已撤回的版本下载失败时必须保留清晰错误，不得伪造成功。
- iPhone、iPad、Vision、榜单、认证、购买和 IPA 平台校验行为不得改变。
- 最新 tvOS 版本默认选中/排在首位；历史版本可单独选择、批量选择和下载。

## Task 1: Swift 历史版本策略与选择限制

### Files

- Modify: `Pastel/AppleVersionIDsRequestPolicy.swift`
- Modify: `Pastel/PastelApp.swift`
- Modify: `NodeProject/test/catalog.test.js`

### Required behavior

1. Apple TV 请求结果使用 `response.versionIDs` 的全部内容，并按返回顺序反转为“最新在前”；空列表保持空列表。不得改变非 Apple TV 的反转逻辑。
2. Apple TV 历史页不再显示“只提供最新版本”的提示；有版本结果时显示版本列表。
3. 移除 Apple TV 只能选择第一条的限制：`selectAllVersionRows()` 对 TV 也选择全部结果；`downloadSelectedVersions()` 和批量菜单对 TV 不再提前返回/隐藏。
4. 保留 `VersionSelectionRow` 的单条下载入口；最新版本仍是默认首选。
5. 为上述行为增加静态源码回归测试：检查 TV policy 使用完整 `versionIDs` 并反转，历史页不再包含只显示最新的文案，且 TV 选择/批量下载不再有对应限制。

### TDD

- 先在 `NodeProject/test/catalog.test.js` 增加失败断言，再修改 Swift；先运行聚焦测试确认失败，再运行测试确认通过。

## Task 2: 回归验证与交付

### Checks

- `cd NodeProject && npm test`
- `xcodebuild -project Pastel.xcodeproj -scheme IDAPastel -configuration Debug -derivedDataPath .build/idapastel-tvos-history CODE_SIGN_IDENTITY=- build`
- 检查 `git diff`、分支和工作区状态。

### Commit

实现完成后提交：`feat: show and download Apple TV history`。
