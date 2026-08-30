# IDAPastel

IDAPastel 仅支持配备 Apple 芯片、运行 macOS 26+ 的 Mac。

## 与 Pastel 的关系

IDAPastel 维护在 `tv` 分支，使用独立 Bundle ID 和本地数据，不覆盖 Pastel。它是基于 Pastel 的独立 fork/branch，并非 Pastel 原作者官方发布的版本。

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

将 IDAPastel.app 拖入 Applications。此版本仅用于自用，以 Ad Hoc 方式分发，且未经过公证（notarization）。首次运行使用右键“打开”；如被阻止，在系统设置的“隐私与安全性”中选择“仍要打开”。

仅对自己确认可信的构建使用下列 quarantine 移除命令：

```bash
xattr -dr com.apple.quarantine /Applications/IDAPastel.app
```

## 来源

tvOS 下载方法参考 MIT 许可的 [majd/ipatool](https://github.com/majd/ipatool) 与 [PR #478](https://github.com/majd/ipatool/pull/478)。IDAPastel 保留原项目作者署名；上述参考不表示原作者官方发布或支持 IDAPastel。
