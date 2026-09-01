# IDAPastel 下载错误弹框实施计划

> **For agentic workers:** 使用 `superpowers:subagent-driven-development`，按任务逐项实现、审查并验证。

## Goal

下载任务失败后，IDAPastel 自动弹出包含具体原因的错误对话框；保留列表中的失败状态、日志、重试和重新登录入口。

## Root cause

`DownloadManager.finish` 只把失败写入 `Job.status/log`，`VersionSelectionRow` 和手动下载区只通过 `DownloadErrorIndicator.help` 提供 tooltip，没有任何 ContentView alert 状态绑定。

## Global Constraints

- 所有产品代码只提交到 `tv` 分支。
- 错误文本必须复用现有 `downloadErrorMessage(from:platform:)`，不泄露凭据、Cookie 或完整认证响应。
- 普通下载和手动版本下载都必须触发弹框；批量下载的多个失败不得造成无限弹框循环。
- 弹框至少提供关闭；支持重试，认证/会话错误额外提供重新登录。
- 保留现有行内错误图标、tooltip、日志和重试行为；不修改 Node 下载协议。
- 版本查询任务的失败状态不能误触发普通下载错误弹框。
- iPhone、iPad、Vision、Apple TV 平台判断和已有登录验证码弹框行为不得回归。

## Task 1: 失败事件与 ContentView 弹框

### Files

- Modify: `Pastel/PastelApp.swift`
- Modify: `NodeProject/test/catalog.test.js`

### Required behavior

1. `DownloadManager` 在普通下载任务失败时发布一次可消费的失败事件，包含 job ID、label、platform 和 log；版本列表查询任务不发布普通下载弹框事件。
2. ContentView 监听该事件并显示 SwiftUI alert，标题包含任务名称，正文使用 `downloadErrorMessage` 生成的具体错误。
3. Alert 的关闭动作清除已消费事件；失败事件在弹框显示期间到达时只保留最新待处理失败，不能重复弹出同一任务。
4. Alert 提供“关闭”和“重试”；如果 `downloadRequiresRelogin` 判断为真，提供“登录”动作并调用现有 `showRelogin`。
5. 重试动作针对失败任务的原始配置重新调用现有下载入口，不改变版本 ID、平台、地区、去更新元数据等配置。
6. 普通版本下载和手动版本下载均可触发弹框；现有行内 `DownloadErrorIndicator` 仍显示。

### TDD

- 先在 `NodeProject/test/catalog.test.js` 添加静态回归断言：DownloadManager 有失败事件模型/发布，ContentView 有 alert 绑定、关闭清理、重试与登录动作，并排除版本列表查询任务；先运行聚焦测试确认失败，再修改 Swift。

## Task 2: 回归验证与交付

### Checks

- `cd NodeProject && npm test`
- 编译并运行 CI 中的 Swift 独立测试
- `xcodebuild -project Pastel.xcodeproj -scheme IDAPastel -configuration Debug -derivedDataPath .build/idapastel-download-error CODE_SIGN_IDENTITY=- build`
- `git diff --check`、工作区和远端分支检查

### Commit

实现完成后提交：`feat: show download errors in alerts`。
