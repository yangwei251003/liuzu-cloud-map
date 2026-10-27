# iPhone / iPad 交付

## 当前可安装方式：PWA

1. 使用 Safari 打开 <https://example.invalid>。
2. 点击“分享”。
3. 选择“添加到主屏幕”。
4. 从主屏幕打开“六祖云游”。

仓库已提供 180px Apple Touch 图标、`appleWebApp` 元数据、`viewport-fit=cover` 和安全区布局。PWA 与网页保持同源，但当前没有 iPhone Safari 真机安装、弱网、语音或安全区验收证据；它只是候选安装路径，不是已核验 IPA 或 App Store 工件。

## 为什么本目录没有 IPA

Windows 不能构建、签名或真机验证 iOS IPA。原生交付必须在 macOS 上使用 Xcode，并由项目方提供：

- 唯一 Bundle ID；
- Apple Developer Team、证书与 Provisioning Profile；
- 隐私清单、SDK 清单和商店元数据；
- iPhone 真机的刘海、安全区、键盘、横竖屏、语音、弱网和恢复测试。

在这些材料和 macOS 构建证据齐备前，不生成或散发无法验证来源的 IPA。
