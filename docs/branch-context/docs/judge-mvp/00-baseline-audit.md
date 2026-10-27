# 云游地图 Web 端基线审计报告

**审计日期：** 2026-08-19
**分支：** `audit/p0-release-readiness-20260815` (HEAD: 1938c06)

## 1. 项目结构图

```text
source-code/web/
├── database/            # PostgreSQL 迁移脚本
│   └── migrations/      # 16个迁移文件，涵盖账号、P0控制面、社交生态、导航智能等
├── scripts/             # 数据库迁移与项目检查脚本
├── src/
│   ├── app/             # Next.js App Router 路由
│   ├── components/      # React 组件库（视图、交互、管理后台原型）
│   └── lib/             # 核心逻辑、数据存储、状态流转、地图封装
├── tests/               # 测试文件（Playwright e2e 与 node:test）
├── package.json         # 项目依赖
└── tailwind.config.js / postcss.config.js 等配置
```

## 2. 技术栈详情

- **核心框架：** Next.js 16.3.0 + React 19.2.8 + TypeScript 5
- **包管理器：** npm 11.12.1
- **地图引擎：** MapLibre GL 6.3.0 + 高德地图（通过 `@amap/amap-jsapi-loader` 与 `amap-loader.client.ts` 加载）
- **UI 与动效：** Tailwind CSS 4, Framer Motion 13.1.0, Phosphor Icons 2.1.10
- **字体：** Noto Sans SC / Noto Serif SC, 霞鹜文楷 (lxgw-wenkai), 马善政悬针篆体 (ma-shan-zheng)
- **空间数据渲染：** `pmtiles` 4.5.0, `terra-draw` 1.32.3
- **后端交互：** PostgreSQL (`postgres` 3.4.9) + PostGIS (地理空间查询)

## 3. 页面与路由清单 (`src/app/`)

- `/` (`page.tsx`): 首页入口
- `/account`: 游客账号中心
- `/admin/*`: 管理后台系列路由
  - `/admin`: 治理总览原型 (`AdminGovernance.tsx`)
  - `/admin/map-editor`: 候选草稿编辑器 (`MapDraftEditor.tsx`)
  - `/admin/gis-review`: GIS 专业审核
  - `/admin/gis-formalization`: GIS 正式化发布
  - `/admin/readiness`: 预发布检查预检
  - `/admin/route-operations`: 道路运营管制
- `/arrival`: 到达导览助手
- `/cloud-tour`: 云游体验
- `/community` & `/community/[placeId]`: 社区与地点兴趣圈
- `/guide` & `/guide/ask`: 智能导游与问答
- `/journey` & `/journey/knowledge`: 行程中心与知识储备
- `/map`: 核心全景地图
- `/navigation-lab`: 导航仿真实验室
- `/plan`: 智能行程规划
- `/privacy`: 隐私政策
- `/profile/[handle]`: 游客公开个人主页
- `/share`: 路线与行程分享

## 4. 组件清单（核心组件，`src/components/`）

- **后台治理与编辑：** 
  - `AdminGovernance.tsx`: 基于 localStorage 的治理审核与角色流转原型
  - `MapDraftEditor.tsx`: 基于 Terra Draw 的地图点线面编辑器，隔离草稿区，支持 WGS84 数据产出
  - `GisDraftReviewWorkbench.tsx` / `GisFormalizationWorkbench.tsx`: 审核与发布工作台
- **地图体验：**
  - `ScenicMap.tsx` / `DeferredScenicMap.tsx` / `DetailedMapCanvas.tsx`: 核心地图渲染封装
  - `AmapDetailedMap.tsx` / `AmapEmbeddedNavigator.tsx`: 高德地图集成组件
  - `FormalNavigationMap.tsx`: 正式导航渲染组件
- **用户交互体验：**
  - `ChanxiaoliAssistant.tsx`: 智能助手
  - `TravelNotePlanner.tsx` / `SmartScenicItineraryPlanner.tsx`: 游记与行程规划
  - `SocialCommunityExperience.tsx`: 社区动态流交互
  - `LiveGuide.tsx` / `AIGuidePanel.tsx`: 语音导游与讲解
- **辅助功能：**
  - `AccessibilityShell.tsx` / `AccessibleDialog.tsx`: 无障碍访问封装

## 5. Lib 模块清单 (`src/lib/`)

- **地图核心 (`amap-*.ts`, `map-*.ts`, `gis-*.ts`)**: 高德 SDK 封装、MapLibre 渲染客户端、GIS 数据契约、坐标系转换 (gcj02.ts)。
- **导航与路线 (`formal-navigation-*.ts`, `route-*.ts`, `directed-route-engine.ts`)**: 导航状态机、路网数据结构、语音播报、封路管制运算。
- **管理治理 (`admin-governance-store.ts`, `map-editor-draft.ts`)**: 管理端的数据存储（纯前端 LocalStorage 数据）、草稿存储逻辑。
- **数据流与社交 (`journey-store.ts`, `community-program-store.ts`, `visitor-account.ts`, `social/`)**: 状态同步与社区交互逻辑。
- **硬编码数据 (`scenic-data.ts`)**: 六祖故居、国恩寺、藏佛坑等候选点位，包含 WGS84/GCJ02 坐标和候选游览建议时间。

## 6. 数据流分析

- **状态管理：** 强依赖模块化的 `store` 模式（如 `admin-governance-store.ts`, `journey-store.ts`），利用 React Context / Hook 与浏览器 LocalStorage 进行本地持久化。
- **API 层：** `server/` 和 API 路由直接暴露给客户端。
- **数据库交互：** 采用 PostgreSQL + PostGIS。使用 `schema_migrations` 管理表。核心表结构极为规范严密：包含 P0 控制面 (`data_sources`, `scenic_area_publications`, `published_pois` 等) 和 UGC 生态 (`social_profiles`, `social_posts`, `social_comments`, `travel_check_ins` 等)。所有发布表都受发布版本号与审核状态保护。

## 7. 地图能力分析

- **MapLibre GL：** 用于矢量瓦片（PMTiles 协议）渲染和自绘交互 (`terra-draw`)。支持离线打包和严格的 WGS84 几何验证。
- **高德地图 (AMap)：** 封装在 `amap-loader.client.ts` 与 `AmapEmbeddedNavigator.tsx` 等文件。用于标准道路规划、导航语音及实时路况展示。通过 `gcj02.ts` 实现 GCJ-02 与 WGS84 的双向转换。

## 8. 设计系统分析

- 深度依赖 **Tailwind CSS v4**。使用了 CSS 变量，配色强调自然与禅意（如 `#173f35`，`#b88a43` 烫金感）。
- 字体排印：通过 `@fontsource` 和 `@fontsource-variable` 引入了 `Noto Sans SC`（思源黑体），`lxgw-wenkai`（霞鹜文楷），以及 `ma-shan-zheng` 用于大字书法标题展示。
- 交互动效使用 **Framer Motion v13**。

## 9. 测试情况分析

- 采用了 `Playwright` 进行 E2E 测试 (`tests/e2e`)。
- 后端逻辑与 API 接口使用 Node.js 原生测试运行器 (`node:test`)。
- 涵盖了身份验证 (`visitor-identity-*.test.mjs`)，缓存策略，AI 质量 (`ai-quality-golden-set`) 与 地图交互 (`map-*.test.mjs`)。

## 10. 可复用模块（三端 MVP 推荐复用）

- `MapDraftEditor.tsx` & `terra-draw` 封装层：优秀的点线面空间绘制组件，可以完全作为数据标注和基础编辑端点。
- `scenic-data.ts` 基础数据：已校准的六祖故居、国恩寺坐标，可做核心展示底盘。
- `amap-loader.client.ts` 与高德封装模块：标准的高德地图懒加载实现，稳定可用。
- `tailwind.config` / `experience-v3.css` 等视觉资产体系。

## 11. 不宜改动模块（高风险）

- `database/migrations/` 下的核心系统表 (`published_pois`, `route_network_revisions`) 结构。它们牵涉到严格的发布流，不应在 MVP 阶段随意 Alter。
- `formal-navigation-runtime.ts` 及周围的导航状态机引擎：逻辑极为复杂，一旦破坏将导致离线与实时导航状态冲突。
- `AmapEmbeddedNavigator.tsx` 中的通信边界与权限绑定。

## 12. 基线问题清单

1. **管理后台持久化问题：** `AdminGovernance.tsx` 与其 store 数据完全挂在 LocalStorage 上，只作为“原型验证”。如果是真后台 MVP 需要连到真正的 Database。
2. **候选坐标系的混用：** `scenic-data.ts` 中同时并存 `originalGcj02` 和 `WGS84` 值，并且 WGS84 是非专业计算的“原型展示近似值”，存在导错路的风险。

## 13. 风险评估

- **审核与发布的强耦合：** 表结构定义了 `DRAFT -> IN_REVIEW -> APPROVED -> PUBLISHED` 极度严格的发布流水线，这意味着想要直接改动一个 POI 或路线，必须实现整条 API 或伪造审核流。这对于快速上线是一个包袱。
- **多引擎混用隐患：** 同时引入 MapLibre 和 AMap，二者在底图渲染、缩放交互体验以及层级控制上有较大差异。
- **纯前端权限：** 原型后台依赖纯前端下拉框切换角色 (`OPERATION_EDITOR` 等)，这在面向真系统的 MVP 开发时是致命风险。

## 14. 推荐最低侵入实现方案

1. **对于数据维护：** 保留现有的严格发布流但绕过前端治理台，在后端开一个“一键走完草稿->发布”的快速插入 API，直接向 `published_pois` 或 `scenic_area_publications` 灌入通过数据。
2. **对于地图编辑：** 直接剥离并复用 `MapDraftEditor` 产出 GeoJSON，交由开发人员写脚本进行批量数据导入，而不让编辑器直接直连线上主路网。
3. **对于用户端：** 保留 Next.js SSR 路由结构，以 `scenic-data.ts` 为核心只提供“点对点路线规划”（调用高德路线 API），暂时隐藏或 Mock 掉复杂的 UGC（社区、发帖、审核）入口，实现 MVP 的快速发布。
