# Android 候选预览壳

这是一个不申请定位权限、没有 JavaScript Bridge、只允许单一 HTTPS 主机在 WebView 内打开的测试壳。应用顶部始终显示“公开测试候选 · 真实景区内部导航未放行”。外部 HTTPS 链接交给系统浏览器，TLS 错误直接失败关闭。

## 构建

在已安装 Android SDK Platform 35、Build Tools 35 和 JDK 17 或 21（Gradle 8.9 不支持 Java 25） 的 Windows/macOS/Linux 主机上：

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
./gradlew.bat :app:assembleDebug -PwebAppUrl=https://<已验证的-preview-host>
```

输出：`app/build/outputs/apk/debug/app-debug.apk`。

`webAppUrl` 是强制参数；未提供时构建会失败关闭，避免误把旧部署打进新安装包。构建当前候选时必须显式注入本次已验证 Preview URL，并先核对 HTTPS、页面版本、访问保护和免责声明。

调试 APK 由本机 Android debug key 签名，只适合侧载测试。release APK/AAB 需要项目方独立 keystore、版本治理、商店账号、隐私披露与真机验收。


## 本次源码复核

使用既有 Android SDK 35、Build Tools 35、JBR 21 和独立 Gradle 8.9 缓存，在离线模式编译 assembleDebug 成功。构建 URL 使用 https://example.invalid/，仅证明编译链路，不是可用服务地址。未安装设备、未进行真机 WebView/TLS/外链行为验收；不分发该调试包或密钥。
