# 云游地图字体视觉地图

更新时间：2026-08-18

| 页面 | 元素 | 字体角色 | 实际字体 | Size | Weight | Letter Spacing |
| --- | --- | --- | --- | --- | --- | --- |
| 首页 | Hero 两行主标题 | Cultural Display | 方正清刻本悦宋简体 WOFF2 子集 | `clamp(2.35rem, 3.18vw, 3.1rem)` | 400 | `0.015em` |
| 首页 | 推荐路线标题 / 景点卡片名称 | Cultural Display | 方正清刻本悦宋简体 WOFF2 子集 | `clamp(.96rem, 1.25vw, 1.12rem)` | 400 | `0.015em` |
| 首页 | 宣传轮播标题 | Humanistic | LXGW WenKai | `1.08rem` | 500 | `-0.025em` |
| 全站 | Header / Button / Form | UI | Noto Sans SC Variable | `0.75rem–1rem` | 500–700 | normal |
| 全站 | PageShell 标题 | Cultural Display | 方正清刻本悦宋简体 WOFF2 子集 | `2.5rem` | 400 | `0.015em` |
| 行程页 | 头部主标题 | Cultural Display | 方正清刻本悦宋简体 WOFF2 子集 | `2.35rem–3.75rem` | 400 | `0.02em` |
| 社区页 | 左侧品牌大字 / 地点社区大字 | Cultural Display | 方正清刻本悦宋简体 WOFF2 子集 | `2rem–4rem` | 400 | `0.01em–0.015em` |
| 我的页 | 账号主标题 | Cultural Display | 方正清刻本悦宋简体 WOFF2 子集 | `2.35rem–3.75rem` | 400 | `0.02em` |
| 到达助手 | Hero 标题 | Cultural Display | 方正清刻本悦宋简体 WOFF2 子集 | `clamp(2.6rem, 7vw, 6.3rem)` | 400 | `0.015em` |
| AI 导游 | 面板标题 | Cultural Display | 方正清刻本悦宋简体 WOFF2 子集 | `1.5rem` | 400 | `0.015em` |
| 云游章节 | 页面 Hero | Cultural Display | 方正清刻本悦宋简体 WOFF2 子集 | `2.25rem–3.75rem` | 400 | `0.015em` |
| 云游章节 | 景点名称 | Historical Display | 方正清刻本悦宋简体 WOFF2 子集 | `1.875rem–2.25rem` | 400 | `0.015em` |
| 云游章节 | 文化讲解正文 | Humanistic Quote | LXGW WenKai | `1rem` | 500 | `0.035em` |
| 云游章节 | 章节路线名 | Humanistic | LXGW WenKai | `1.25rem` | 500 | normal |
| 社区 | 地点卡片标题 | Humanistic | LXGW WenKai | `.94rem` | 500 | normal |
| 社区 | 功能标签 / 操作 | UI | Noto Sans SC Variable | `.68rem–.875rem` | 500–700 | normal |
| 地图 | POI / Marker / 路线节点 | UI | Noto Sans SC Variable | `.68rem–1rem` | 500–700 | normal |
| 地图 | 选中地点摘要 | Cultural Display | 方正清刻本悦宋简体 WOFF2 子集 | `1rem–1.1rem` | 400 | normal |
| Footer | 版权、链接、联系方式 | UI | Noto Sans SC Variable | `.75rem–.875rem` | 500 | normal |
| 移动端 | 首页 / 行程 / 社区 / 我的大标题 | Cultural Display | 方正清刻本悦宋简体 WOFF2 子集 | `2.35rem–3.2rem` | 400 | `0.01em–0.02em` |
| 移动端 | 正文 / 操作 / 地图 | UI | Noto Sans SC Variable | `1rem` | 500–650 | normal |

## 排版规则

1. 艺术字体最多承担一段文本中的一个视觉层，不连续套用三种艺术字体。
2. 长正文、导航、地图、按钮、输入、错误和安全提示不使用毛笔或装饰字体。
3. Hero 和文化标题允许更大胆，但移动端优先控制换行和首屏高度。
4. 所有新字体都使用 `font-display: swap`，不预加载完整 CJK 字库；桌面与移动端共用相同角色，移动端只收窄字号和字距。
