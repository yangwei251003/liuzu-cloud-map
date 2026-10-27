# 字体授权状态

更新时间：2026-08-17

## 已安装并用于网站

| 字体 | 来源 | 是否开源 | 当前状态 | 使用范围 |
| --- | --- | --- | --- | --- |
| Noto Sans SC Variable | Fontsource / Google Noto | 是 | 已安装 `@fontsource-variable/noto-sans-sc@5.3.0` | UI、地图、功能信息、正文 |
| Noto Serif SC Variable | Fontsource / Google Noto | 是 | 已安装 `@fontsource-variable/noto-serif-sc@5.3.0` | 页面标题、文化标题 |
| LXGW WenKai / 霞鹜文楷 | [官方 GitHub](https://github.com/lxgw/LxgwWenKai) / Fontsource | 是，SIL OFL 1.1 | 已安装 `@fontsource/lxgw-wenkai@5.3.0` | 文化说明、景点名、社区标题 |
| Ma Shan Zheng / 马善政体 | Google Fonts / Fontsource | 是，SIL OFL 1.1 | 已安装 `@fontsource/ma-shan-zheng@5.3.0` | Hero 短标题、视觉强调 |
| 汉仪尚巍手书 | 用户提供 TTF（SHA-256 `BBEB4D9F2CA1375F54956C67AB806B925B82844BE89DD40F75D90B971B422FFE`） | 需以用户提供的授权凭证为准 | 已从 TTF 生成项目本地 WOFF2 子集 `public/fonts/hy-shangwei-shoushu.woff2` | Hero 首句、品牌情绪短句 |
| 汉仪曾翔禅趣体 | 用户提供 TTF（SHA-256 `87BA9BE5EF74C08BB8D14C01D13E5B3C839436B7E79215AC4B47B45B5E6A59CB`） | 需以用户提供的授权凭证为准 | 已从 TTF 生成项目本地 WOFF2 子集 `public/fonts/hy-zengxiang-chanqu.woff2` | 禅意标记、短章节符号 |
| 汉仪北魏写经 | 用户提供 TTF（SHA-256 `5F310C3E58EA8BCF240ABAF224EB33F3DF56AA349527E88856266164A7B02361`） | 需以用户提供的授权凭证为准 | 已从 TTF 生成项目本地 WOFF2 子集 `public/fonts/hy-beiwei-xiejing.woff2` | 历史/文化短标题、景点名 |
| 方正清刻本悦宋简体 | 用户提供 TTF（官方字体 ID `FZQKBYSJW`） | 需以用户提供的授权凭证为准 | 已生成项目本地 WOFF2 子集 `public/fonts/fz-qingke-yuesong.woff2` | 页面/章节标题、景点名、文化卡片 |
| 方正宋刻本秀楷简体 | 用户提供 TTF（官方字体 ID `FZSKBXKJW`） | 需以用户提供的授权凭证为准 | 已生成项目本地 WOFF2 子集 `public/fonts/fz-songke-xiukai.woff2` | Hero 首句、品牌情绪短句 |
| 方正行楷简体 | 用户提供 TTF（官方字体 ID `FZXKJW`） | 需以用户提供的授权凭证为准 | 已生成项目本地 WOFF2 子集 `public/fonts/fz-xingkai.woff2` | Hero 问句、路线标题、短叙事 |

## 方正字体云：已做授权后可开启的适配

截图中的两款字体已在方正官方云字库确认：方正行楷简体字体 ID 为 `FZXKJW`，方正清刻本悦宋简体字体 ID 为 `FZQKBYSJW`。官方 JS 接入需要方正云字库申请的 Key，并且授权范围需要覆盖企业网站/WebFont 与后续 Android WebView 使用；当前项目没有读取或记录 Key。

- 适配组件：`src/components/FounderCloudFonts.tsx`
- 激活变量：`NEXT_PUBLIC_FOUNDER_CLOUD_KEY`（只记录变量名，不记录值）
- 激活后选择器：`.founder-cloud-xingkai`、`.founder-cloud-qingke`
- 无 Key、Key 失效或云端失败时，页面继续使用本地方正 WOFF2/汉仪/Noto fallback，不阻塞游客功能。
- 官方调用说明：[方正行楷简体云字库](https://shop.foundertype.com/index.php/CloudAuth/useFont/id/FZXKJW/font_name/%E6%96%B9%E6%AD%A3%E8%A1%8C%E6%A5%B7%E7%AE%80%E4%BD%93.html)、[方正清刻本悦宋简体云字库](https://shop.foundertype.com/index.php/CloudAuth/useFont/id/FZQKBYSJW/font_name/%E6%96%B9%E6%AD%A3%E6%B8%85%E5%88%BB%E6%9C%AC%E6%82%A6%E5%AE%8B%E7%AE%80%E4%BD%93.html)。

## 未自动下载的商业字体

以下字体虽已由用户提供并转为本地 WOFF2 子集，但项目当前没有可核验的商业 Web/嵌入授权凭证，因此状态仍标为待授权：

| 字体 | 授权状态 | 当前 fallback | 原因 |
| --- | --- | --- | --- |
| 方正宋刻本秀楷 | 待授权 | 本地用户提供文件已接入 | 商业 Web/嵌入发布授权仍待补录 |
| 方正行楷 | 待授权 | 本地用户提供文件已接入 | 商业 Web/嵌入发布授权仍待补录 |
| 方正清刻本悦宋 | 待授权 | 本地用户提供文件已接入 | 商业 Web/嵌入发布授权仍待补录 |

如果后续取得正式授权，应只通过字体厂商提供的 WebFont、SDK 或授权交付包接入，并将授权凭证、允许域名、可否打包 APK、可否公开分发和到期时间补录到本文件。

## 性能与分发边界

- 用户提供的完整 TTF 不直接分发；仅把实际页面字符子集转成 WOFF2，原始文件仍留在用户 Downloads，不复制进仓库。
- 6 个本地艺术字体 WOFF2 子集使用 `font-display: swap`，当前单文件约 15–111 KB，不阻塞首屏 UI 字体。
- 不使用不明网盘、破解字体库或运行时未登记 CDN。
- `font-display: swap` 保证字体加载失败时仍回退到已审查字体。
