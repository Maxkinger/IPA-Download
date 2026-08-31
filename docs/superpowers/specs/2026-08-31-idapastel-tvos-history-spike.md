# IDAPastel tvOS Apple 历史版本验证设计

## 目标

验证 IDAPastel 能否在不建设数据库的情况下，用 `atv9` 返回的最新 tvOS 外部版本 ID 引导 Apple StoreServices 返回同一 tvOS 版本族的 `softwareVersionExternalIdentifiers`。

## 范围

- 仅修改 Node 的 Apple 版本 ID 枚举结果和自动化测试。
- 不接入 Timbrd、Agzy、Bilin 或第三方 IPA 存档。
- 不改变 Swift 界面；Apple TV 在本机账户实测通过前仍只显示最新版本。
- 不保存、提交或记录真实 Apple 账户凭据、Cookie、Token 或原始认证响应。

## 安全判定

Apple TV 查询先通过现有 `atv9` 请求解析最新外部版本 ID，再将该 ID 传给 `volumeStoreDownloadProduct`。只有当返回的 `softwareVersionExternalIdentifiers` 包含这个已解析的 tvOS ID 时，才将整组 ID 视为同一 tvOS 版本族。

如果列表为空或不包含已解析的 tvOS ID，必须回退为仅返回最新 tvOS ID，防止 Apple 忽略平台版本 ID 后把 iOS 历史误当成 tvOS 历史。

## 输出契约

`Ipa.listVersionIds(appID, "appletv")` 保持现有 JSON 结构：

- `platform` 固定为 `appletv`。
- `latestVersionId` 固定为 `atv9` 解析出的最新 tvOS ID。
- `versionIds` 在安全判定通过时返回去重后的 Apple 版本族；否则返回只含 `latestVersionId` 的数组。

iPhone、iPad、Vision、下载、购买、IPA 平台校验和 Swift UI 行为不得改变。

## 验证

自动化测试用 StoreServices 响应夹具覆盖：

1. 返回列表包含最新 tvOS ID 时，接受、字符串化并去重整个列表。
2. 返回列表不包含最新 tvOS ID 时，拒绝该列表并回退到最新 tvOS ID。
3. 现有 Node 全量测试继续通过。

自动化测试只能证明安全判定和代码路径。Apple 是否为具体账户和 App 返回完整 tvOS 版本族，仍需在本机登录后用免费 Apple TV App 做一次凭据化验证。
