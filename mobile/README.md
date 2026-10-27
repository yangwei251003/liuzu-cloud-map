> 历史设计/验收资料：部分原型媒体、字体、服务及交付方案不随本次公开副本提供。当前可运行范围与验证结果以根 README、THIRD_PARTY_NOTICES 和 docs/release-validation.md 为准。

# 六祖云游移动端交付说明

当前移动交付分为两层，二者都保持“真实景区内部导航未放行”的安全边界：

1. **PWA（Android 与 iPhone）**：部署到 HTTPS 后，可从 Chrome 或 Safari 添加到主屏幕。它与网页同源，身份、分享和安全策略不会因本地壳来源而失效。
2. **Android Web Shell（测试 APK）**：`android-web-shell/` 是不申请定位权限的候选预览壳，始终显示“公开测试候选”横幅。构建时把已验证的 HTTPS Preview URL 注入 `webAppUrl`。

Windows 无法构建或签名 iOS IPA。iPhone 当前交付物是标准 PWA；原生 IPA 必须在 macOS、Xcode、Apple Developer 签名和真机条件下完成。详见 `ios/README.md`。

本目录不包含签名私钥、证书、账号或生产密钥。任何 release APK/AAB/IPA 都必须由项目方提供独立签名材料并完成隐私、SDK 和商店审核。

当前最新版绑定 Vercel Production 部署 `dpl_83mgY6eeTdkteBT2baAYw1GiPBvN`，固定公开地址为 <https://example.invalid>。Android 最新测试 APK 为 `liuzu-cloud-tour-motion-live-AcC7BnL-v0.6.0-debug.apk`，直接绑定该公开域名且不包含访问令牌；网页内容会随该固定地址同步更新。精确文件、哈希与验证边界见 `deliverables/README.md`。
