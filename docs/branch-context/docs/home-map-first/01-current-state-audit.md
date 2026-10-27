# 项目现状审计报告 (01-current-state-audit.md)

## 1. 技术栈与架构总览

- **前端框架**：Next.js 16.3.0 (App Router) + React 19.2.8 + TypeScript 5
- **样式方案**：TailwindCSS v4 + CSS Modules (`HomeReferenceExperience.module.css`, etc.)
- **地图引擎**：
  - 高德地图 JS API v2 (`amap-jsapi-v2`，为主选引擎，支持 GCJ-02 真实道路、路径规划与导航)
  - MapLibre GL v6.3.0 本地离线备用渲染 (`maplibre-local`，支持 PMTiles 与本地矢量图层)
- **动效库**：Framer Motion 13.1.0 + 自研文化动效系统 (`CulturalMotion.tsx`, `motion-system.ts`)
- **图标体系**：`@phosphor-icons/react` 2.1.10 (统一线宽与 duotone/bold 风格)
- **字体系统**：本地变量字体 (`Noto Sans SC`, `Noto Serif SC`, `LXGW WenKai`, `Ma Shan Zheng` 及方正/汉仪文化字体)
- **后端/API**：Next.js Route Handlers (`/api/v1/auth/*`, `/api/v1/share/*`, etc.)
- **数据库/状态**：PostgreSQL (`postgres` 3.4.9) + 浏览器端本地 Storage/Store (`journey-store.ts`, `visitor-account.ts`)

---

## 2. 首页首屏现状与视觉层级问题分析

### 2.1 当前首屏主要问题
1. **地图位置过深、非首屏核心**：
   - 顶部导航栏占用约 90px 高度。
   - 导航下方首先出现大尺寸“宣传影像轮播区” (`ScenicPromotionCarousel`) 和文化标语段落（“今天，想怎样遇见新兴？”），以及“为你推荐 · 半日禅意路线”的景点列表卡片。
   - 真实可交互地图 (`DetailedMapSurface`) 被挤压在页面下半部分，桌面 1440×900 视口下需要向下滑动才能完整看到地图。
2. **地图被过多外围控件压缩与割裂**：
   - 地图上方独占一整行“地图风格”选择栏（标准地图、禅意皮肤、青山绿水、复古国风、3D 立体）。
   - 地图左下、右上存在浮层与遮挡，但缺乏紧凑的系统化浮层层级。
3. **五类核心能力入口散落或隐式**：
   - 地图查看：仅在下半区展示，缺乏首屏全景感；
   - 地图导航：隐藏在点位或者子页面中，首屏没有直接的“去导航”明确入口；
   - 地图交互：图层、定位、缩放与辅助功能分散；
   - 地图社交：只有文字链接“看游客摄影”，没有联动点位的社区探索闭环；
   - 地图规划：“让禅小荔陪我规划”浮在文本区，未与地图首屏深度协同。

---

## 3. 登录/注册页现状分析

### 3.1 路由与结构
- 独立路由：`/account` (由 `src/app/account/page.tsx` 承载，调用 `VisitorAccountCenter` 与 `NavigationHistoryPanel`)。
- 采用卡片居中/双栏布局，左侧为项目隐私与说明，右侧为登录/注册表单。

### 3.2 鉴权机制与接口协议
- **接口**：
  - `GET /api/v1/auth/me`：检查当前游客会话。
  - `POST /api/v1/auth/login`：游客账号登录。
  - `POST /api/v1/auth/register`：建立轻量游客账号。
  - `POST /api/v1/auth/logout`：退出会话。
- **凭据规则**：
  - Handle（账号名）：3 至 32 位字母、数字、下划线、短横线。
  - Passphrase（口令）：至少 12 字符。
  - 会话存储于 HttpOnly Cookie。
- **现存体验短板**：
  - 缺乏与“地图优先”相呼应的地图视觉氛围；
  - 缺乏从其他页面（如点击“加入行程”、“发布动态”）被拦截到登录后的 `redirect` 回跳恢复机制；
  - 缺少“暂不登录，返回地图”快捷通道。

---

## 4. 可复用组件与代码资产清单

| 资产类别 | 组件/模块路径 | 核心能力与复用方式 |
| :--- | :--- | :--- |
| **地图引擎与表面** | `src/components/DetailedMapSurface.tsx` | 封装高德地图与 MapLibre 降级，支持模式、图层、点位与选路 |
| **高德地图实现** | `src/components/AmapDetailedMap.tsx` | 真实高德 SDK 实例化、点位渲染、轨迹绘制、定位与视口控制 |
| **地点数据集** | `src/lib/scenic-data.ts`, `src/lib/scenic-image-registry.ts` | 6 大核心景区点位数据、真实摄影图库、实景关系 |
| **路线与规划逻辑**| `src/lib/personal-route-builder.ts`, `src/components/SmartScenicItineraryPlanner.tsx` | 智能路线生成算法、推荐路线、行程保存 |
| **社区数据与入口**| `src/components/SocialCommunityExperience.tsx`, `src/lib/community-types.ts` | 地点社区动态、点赞互动、GPS 绑定发布 |
| **导航中枢** | `src/components/AmapEmbeddedNavigator.tsx`, `src/components/FormalNavigationPlanner.tsx` | 站内高德路线导航、步行/驾车规约 |
| **游客鉴权逻辑** | `src/components/VisitorAccountCenter.tsx`, `src/lib/visitor-account.ts` | 严格安全校验、防爆破、Cookie 会话与多租户隔离 |
| **品牌与动效** | `src/lib/brand-assets.ts`, `src/components/motion/CulturalMotion.tsx` | 官方 Logo、文化纹理、无障碍动效开关 |

---

## 5. 风险与依赖项
1. **地图 Token 与网络依赖**：依赖高德 Web 服务及 JS API Key，在无网络时需无缝降级为 MapLibre 离线模式。
2. **严禁破坏原有后端**：鉴权、会话及数据库结构必须 100% 保持不变。
3. **响应式与手势冲突**：移动端地图手势（缩放/拖拽）需与外层页面纵向滚动明确区分，提供手势安全区。
