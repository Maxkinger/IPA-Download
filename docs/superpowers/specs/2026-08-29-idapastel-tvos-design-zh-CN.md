# IDAPastel tvOS 支持与 DMG 分发设计

## 一、设计概要

建立一个长期维护的 `tv` 分支，在该分支中生成可独立安装的 macOS 应用 `IDAPastel`。该分支参考 `majd/ipatool` 已验证的 Apple TV 平台处理方式，增加 Apple TV 应用搜索及 tvOS IPA 下载能力，同时保持上游 `main` 分支纯净、可持续同步。

IDAPastel 定位为自用软件。它通过 GitHub Actions 和 GitHub Releases 分发 arm64、Ad Hoc 临时签名的 DMG，不要求加入 Apple Developer Program，也不使用 Developer ID 签名或 Apple 公证。

## 二、目标

- 本地及个人 Fork 的 `main` 始终与 `Maxkinger/IPA-Download` 同步，不放入自定义产品改动。
- 所有 IDAPastel 改动长期维护在 `tv` 分支。
- Pastel 与 IDAPastel 可以同时安装、同时运行。
- IDAPastel 的账户、Keychain、会话、设置、应用数据和默认下载目录与 Pastel 完全隔离。
- 支持搜索 Apple TV 应用，以及通过 App ID 或支持的 App Store 输入进行查找。
- 支持下载最新 tvOS 包，或通过已知外部版本 ID 下载指定包。
- 当 Apple 错误返回 iOS 包时，拒绝将其作为 Apple TV 包保存。
- GitHub Actions 无需付费 Apple 凭据即可生成可挂载的 IDAPastel DMG。
- 上游未来更新能够以较低冲突成本合并到 `tv`。

## 三、第一版不包含的功能

- 完整的 tvOS 历史版本目录。
- Timbrd、Agzy 或 Bilin 的 tvOS 历史版本数据。
- 通过 AirDrop 安装到 Apple TV。
- 自动安装 IPA 到 Apple TV。
- Developer ID 签名、Hardened Runtime 或 Apple 公证。
- Mac App Store 分发。
- Sparkle 自动更新。
- 重命名 Xcode 工程、Target、Swift 源文件或内部 Swift 类型。
- 重新设计应用图标。

## 四、仓库与分支模型

在用户创建个人 GitHub Fork 后，使用两个 Remote：

- `upstream`：`https://github.com/Maxkinger/IPA-Download.git`
- `origin`：用户可写入的个人 GitHub Fork

分支职责固定如下：

- `main`：镜像 `upstream/main`，不包含任何 IDAPastel 自定义提交。
- `tv`：包含 IDAPastel 身份、tvOS 支持、测试、文档和 GitHub Actions。

首次设置：

```bash
git remote rename origin upstream
git remote add origin <你的-Fork-地址>
git switch main
git push -u origin main
git switch tv
git push -u origin tv
```

后续同步上游时，`tv` 使用普通 Merge，不使用 Rebase 或强制推送：

```bash
git switch main
git fetch upstream
git merge --ff-only upstream/main
git push origin main

git switch tv
git merge main
git push origin tv
```

保留 Xcode 工程名、Target 名、`PastelApp.swift` 文件名和内部 Swift 类型名，可以减少以后反复出现的合并冲突；只修改最终产品身份和用户可见名称。

## 五、产品身份与数据隔离

最终产品身份：

- App 包：`IDAPastel.app`
- 显示名称：`IDAPastel`
- Product Name：`IDAPastel`
- Bundle ID：`com.idapastel.app`
- 默认下载目录：`~/Downloads/IDAPastel`

Xcode Target 继续命名为 `Pastel`。只对产品引用和 `PRODUCT_NAME` 做生成 `IDAPastel.app` 所必需的修改。

持久化数据隔离如下：

- Swift Application Support：`~/Library/Application Support/IDAPastel`
- Node 会话兜底目录：`~/Library/Application Support/IDAPastel/sessions`
- Device GUID Keychain Service：`com.idapastel.app.device-guid`
- Apple 账户密码 Keychain Service：`com.idapastel.app.apple-account-password`
- UserDefaults：通过新 Bundle ID `com.idapastel.app` 自动隔离
- 临时工作目录：统一使用 `IDAPastel-` 前缀

不会自动读取、复制或迁移 Pastel 的账户、会话、设置和密码。用户仍可主动选择其他下载目录，但首次安装时默认目录保持独立。

通知名称和 Swift 类型名等仅在进程内部生效的标识可以继续保留 `Pastel`，因为两个 App 位于不同进程，不会发生冲突；修改这些名称只会增加上游合并成本。

### Sparkle 隔离

当前 Sparkle Feed 和 EdDSA 公钥属于上游 Pastel。如果 IDAPastel 继续使用该 Feed，可能会被错误更新成 Pastel。

第一版处理方式：

- 关闭自动更新检查。
- 隐藏或禁用“检查更新”操作。
- 不使用上游 `SUFeedURL`、`SUPublicEDKey` 和 `appcast.xml`。
- 为减少上游冲突，仅在编译仍需要时保留 Sparkle 依赖。
- 更新版本通过 IDAPastel 自己的 GitHub Releases 手动下载。

未来可以单独设计 IDAPastel 的 Sparkle 密钥和 appcast。Sparkle EdDSA 签名与付费 Apple Developer Program 无关。

## 六、tvOS 平台模型

在 Swift 和 Node 各层增加一等 Apple TV 平台。

统一内部值：

```text
appletv
```

接受以下输入别名：

```text
tv
tvos
tvOS
apple-tv
appletv
AppleTV
```

Swift 增加 `appleTV` 平台枚举，Raw Value 为 `appletv`，使用系统 `appletv` 图标，对用户显示“Apple TV”。Node 将所有上述别名归一化为 `appletv`。只有在现有逻辑明确需要默认平台时，未知值才继续回退到 iPhone。

## 七、搜索与查找行为

遵循 `majd/ipatool` 已验证的平台映射：

- Apple TV 精确查找实体：`tvSoftware`
- Apple TV 搜索实体：`software,tvSoftware`
- Apple TV 元数据平台：`atv9`

搜索、查找和平台归一化都接收显式 `platform` 参数。在 Apple TV 模式选择的结果，必须通过 Swift ViewModel 和下载配置一直保留 `appletv` 平台标记。

第一版不会拿 iPhone RSS 榜单伪装成 Apple TV 推荐榜。如果没有确认可靠的 Apple TV 榜单来源，Apple TV 首页显示搜索或输入 App ID 的引导。

对于 iOS 与 tvOS 共用同一 Adam ID 的 Universal Purchase App，通过平台专属外部版本 ID 和最终包校验决定是否接受下载结果。

## 八、解析最新 tvOS 版本

Apple TV 模式下，如果用户没有提供外部版本 ID，请求：

```text
https://uclient-api.itunes.apple.com/WebObjects/MZStorePlatform.woa/wa/lookup
```

请求参数：

```text
version=2
id=<adam-id>
p=mdm-lockup
caller=MDM
platform=atv9
cc=<小写国家代码>
l=en
```

按以下顺序从第一个 Offer 解析外部版本 ID：

1. `offers[0].version.externalId`
2. `offers[0].buyParams` 中携带的版本字段

解析器同时接受 JSON 字符串和数字形式的 `externalId`。没有搜索结果、没有 Offer、没有版本 ID 必须分别报告明确且本地化的错误。

如果用户手动输入外部版本 ID，则跳过最新版本查询，直接将该 ID 传入现有下载流程。

## 九、下载数据流

Apple TV 下载链路：

```text
选择 Apple TV
  -> tvSoftware 搜索/查找
  -> 获得 Adam ID
  -> 使用 atv9 查询最新外部版本 ID，手动提供时跳过
  -> 现有 StoreServices 许可与下载请求
  -> 下载并进行 MD5 校验
  -> 校验包是否支持 AppleTVOS
  -> 现有 SINF/元数据封装
  -> 作为 Apple TV 项目加入下载记录
```

现有购买接口和 `volumeStoreDownloadProduct` 下载接口保持不变，因为 `ipatool` 在 iOS 和 tvOS 上使用相同接口。平台专属外部版本 ID 是选择 tvOS 包的关键参数。

## 十、包校验与清理

修改下载归档前，读取主 App 的 `Payload/*.app/Info.plist`。用户请求 Apple TV 时，`CFBundleSupportedPlatforms` 必须包含 `AppleTVOS`。

如果校验失败：

- 删除平台不匹配的输出文件。
- 删除临时下载分块。
- 不将错误文件加入已下载索引。
- 明确提示 Apple 为当前应用或版本返回了非 tvOS 包。

平台校验通过后，再继续现有 MD5、SINF 和元数据处理。即使 Apple 的可选元数据没有友好平台名称，下载记录也要保留规范化的 `appletv` 标记。

## 十一、Apple TV 用户界面

平台选择器在 iPhone、iPad 和 Vision 之外增加 Apple TV。

Apple TV 模式下：

- 保留搜索和 App ID 查找。
- 版本来源固定为 Apple。
- 支持解析并下载最新版本。
- 支持手动输入已知外部版本 ID。
- 隐藏或禁用第三方历史版本来源。
- 因为没有完整 TV 历史版本，所以禁用“全部下载”。
- 不把 AirDrop 作为 Apple TV 安装方式。
- 已下载 TV 包仍可在 Finder 中显示和删除。
- 已下载列表和分组显示 Apple TV 平台标识。

第一版文档明确：安装 tvOS IPA 不属于 IDAPastel 的功能范围，通常需要另外使用适合用户设备的 Xcode 或 Apple Configurator 流程。

## 十二、错误处理

至少区分以下错误：

- 当前 Storefront 没有 Apple TV 搜索结果。
- `atv9` 元数据响应中没有 tvOS Offer。
- 无法解析 Apple TV 外部版本 ID。
- Apple 账户缺少所需许可。
- StoreServices 返回认证或会话错误。
- 下载包没有声明 `AppleTVOS` 支持。
- 无法打开包或解析其中的 `Info.plist`。
- 主错误发生后，临时文件清理失败。

Node 与 Swift 之间应在现有架构允许的范围内使用稳定、机器可读的错误码。本地化提示说明用户下一步该怎么做，但不得泄露账户 Token、Cookie、密码或原始认证响应。

## 十三、自动化测试

Node 单元测试覆盖：

- Apple TV 输入别名及默认/拒绝行为。
- `tvSoftware` 精确查找参数。
- `software,tvSoftware` 搜索参数。
- `atv9` 元数据请求参数。
- 字符串和数字形式的外部版本 ID。
- `buyParams` 兜底解析。
- 缺失结果、Offer 和版本 ID。
- 包含 `AppleTVOS` 的正确包。
- 拒绝 iPhoneOS 包和损坏的包。
- 删除平台不匹配的输出文件。
- 现有会话失效和认证逻辑不能回归。

Swift 侧通过完整编译和现有 ViewModel 入口验证平台参数传递。仓库和 GitHub Actions 中不保存真实 Apple 账户凭据。

## 十四、本机端到端验证

在 CI 之外，使用一个免费 Apple TV App 和本机 Apple 账户测试：

1. 同时安装 Pastel 与 IDAPastel。
2. 在 IDAPastel 中添加账户，确认 Pastel 中不可见。
3. 确认两个 App 使用不同的 Application Support 目录和 Keychain Service。
4. 搜索一个免费 Apple TV App。
5. 解析它的 `atv9` 外部版本 ID。
6. 下载 IPA。
7. 检查 `Payload/*.app/Info.plist`，确认包含 `AppleTVOS`。
8. 重启 IDAPastel，确认会话可以复用。
9. 确认 Pastel 的设置和会话没有变化。

## 十五、GitHub Actions 与 DMG

新增 `.github/workflows/build-idapastel-dmg.yml`，并在 `Scripts/` 下增加可在本机复用的 DMG 打包脚本，使本机与 CI 使用相同命令。

触发条件：

- Push 到 `tv`：测试、构建、打包并上传 Actions Artifact。
- PR 目标为 `tv`：测试、构建和打包，但不发布 Release。
- 手动 `workflow_dispatch`：测试、构建、打包并上传 Artifact。
- Tag 匹配 `idapastel-v*`：测试、构建、打包、上传 Artifact，并创建 GitHub Release。

工作流运行在 GitHub 托管的 `macos-26` ARM64 Runner，并验证所选 Xcode 主版本为 26。仓库内置 Node 可执行文件是 arm64，因此不能切换到 Intel Runner。

构建约束：

- Configuration：`Release`
- 目标架构：`arm64`
- Code Sign Identity：`-`，即 Ad Hoc 临时签名
- Hardened Runtime：关闭
- Apple 公证：关闭
- Apple 证书 Secret：无
- Apple 账户凭据：无

Node 工程增加并提交 `package-lock.json`，CI 使用 `npm ci` 进行可重复安装。Swift 依赖继续使用现有 `Package.resolved` 锁定。

打包脚本创建以下暂存目录：

```text
IDAPastel.app
Applications -> /Applications
```

然后使用 `hdiutil` 创建 UDZO 压缩 DMG。

输出文件名：

```text
IDAPastel-<版本号>-arm64.dmg
IDAPastel-<版本号>-arm64.dmg.sha256
```

CI 校验：

- 主 App 存在且为 arm64。
- Bundle ID 为 `com.idapastel.app`。
- Bundle 与主程序名称为 IDAPastel。
- 内置 Node 和 `sap-signer` 可执行且为 arm64。
- Sparkle 及嵌套代码通过结构性签名校验。
- App 的 Ad Hoc 签名通过 `codesign --verify --deep --strict`。
- DMG 可以只读挂载。
- 挂载后包含 IDAPastel 和 Applications 快捷方式。
- SHA-256 文件与 DMG 内容匹配。

Ad Hoc、未经公证的 App 本来就不会获得 Gatekeeper 或 `spctl` 信任，所以工作流不要求它们通过。使用文档说明：右键选择“打开”、在“系统设置 → 隐私与安全性”中选择“仍要打开”，以及仅对自己确认可信的构建清除隔离属性。

Actions Artifact 设置有限保留期。Tag 构建使用仓库自带的 `GITHUB_TOKEN` 发布 DMG 和校验文件，不需要第三方发布凭据。

## 十六、上游合并安全性

每次把 `main` 合并到 `tv` 后，重新执行 Node 测试、Xcode Release 构建和 DMG 校验。预计会反复出现冲突的位置限定为：

- `Pastel.xcodeproj/project.pbxproj`
- `Pastel/Info.plist`
- `Pastel/PastelApp.swift` 中的产品身份常量
- 上游修改过的 Node 平台或下载文件

不重命名工程、Target、源文件和内部类型，可以把冲突保持在较小范围。即使上游重构平台代码，也必须保留 IDAPastel 专属测试，避免一次语法上成功的合并悄悄删除 tvOS 能力。

## 十七、来源与署名

tvOS 协议行为参考 MIT 许可的 `majd/ipatool`，包括 Apple TV 平台映射、`atv9` 元数据查询和 `AppleTVOS` 包校验。IDAPastel 的 README 或“关于”页面需要保留署名，并遵守直接复制或紧密改写代码所要求的许可声明。

参考实现：

- <https://github.com/majd/ipatool>
- <https://github.com/majd/ipatool/pull/478>

## 十八、验收标准

- `main` 不包含 IDAPastel 提交，并始终可以从 `upstream/main` 快进同步。
- `tv` 包含所有 IDAPastel 改动，并可以正常合并 `main`。
- Pastel 与 IDAPastel 可以同时存在于 `/Applications`。
- IDAPastel 使用独立 Bundle ID、UserDefaults、Keychain、Application Support、会话和默认下载目录。
- IDAPastel 不使用上游 Pastel 的 Sparkle Feed。
- 可以搜索 Apple TV App，并通过 App ID 查找。
- 最新 tvOS 版本使用 `platform=atv9` 查询。
- 可以通过已知 tvOS 外部版本 ID 手动下载。
- 只有声明 `AppleTVOS` 的包才会作为 Apple TV 下载结果保留。
- 第一版不显示 Apple TV 第三方来源和完整历史版本承诺。
- 现有 iPhone、iPad 和 Vision 功能继续通过构建和测试。
- GitHub Actions 无需 Apple Secret 即可生成可挂载的 arm64 IDAPastel DMG 和 SHA-256 文件。
- `idapastel-v*` Tag 会创建包含 DMG 和校验文件的 GitHub Release。
- 文档明确说明 macOS 26+、Apple 芯片、Ad Hoc 签名、Gatekeeper 和自用限制。
