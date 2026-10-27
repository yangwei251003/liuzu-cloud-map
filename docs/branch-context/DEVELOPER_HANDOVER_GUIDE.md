# 云游地图三端协同系统 · 开发者接手与二次开发交接指南 (Developer Handover Guide)

> 本文档专为**后续接手本项目、进行二次开发、后端接口替换及生产部署的开发者**编写。
> 请在开展任何开发前通读本文档，以便快速掌握项目全貌、架构设计与开发规范。

---

## 1. 项目概览与业务三端定位

“云游地图”是以六祖镇文旅为示范标杆的**文旅地图与多角色生态协同平台**，涵盖三大核心终端与一个演示控制中枢：

```
                    ┌────────────────────────────────┐
                    │    🎛️ 评委演示中枢 (/judge)    │
                    │   (一键切换角色 / 一键重置数据)  │
                    └───────────────┬────────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  🍵 商户伙伴中心  │      │ 🖥️ 云游 Studio   │      │  🗺️ 游客端地图   │
│  (/partner/*)    │      │  (/studio/*)     │      │ (/explore, /map) │
│ • 合作社/商家入驻 │      │ • 审核双栏工作台 │      │ • 瀑布流发现体验 │
│ • 4步活动/点申报 │ ───► │ • 高德经纬度落图 │ ───► │ • 景点与活动详情 │
│ • 提交进度追踪   │      │ • 资源/活动台账  │      │ • 游客轻行程收藏 │
│ • 经营转化漏斗   │      │ • 推荐位精选编排 │      │ • 高德导航直达   │
└──────────────────┘      └──────────────────┘      └──────────────────┘
       ▲                                                           │
       └────────────────── 行为漏斗数据实时回流 ────────────────────┘
```

---

## 2. 极速本地启动 (Quick Start)

### 2.1 环境要求
- **Node.js**：`>= 18.18.0`（推荐 `20.x` 或 `22.x`）
- **npm**：`>= 9.0.0`
- **操作系统**：Windows / macOS / Linux 均支持

### 2.2 安装与运行步骤
```bash
# 1. 进入 Web 工程目录
cd web

# 2. 安装全部依赖
npm install

# 3. 配置环境变量 (已预置默认可用的演示密钥)
cp .env.example .env.local

# 4. 启动开发服务器
npm run dev

# 5. 打开浏览器访问评委演示中枢
# http://localhost:3000/judge
```

### 2.3 常用开发脚本清单
| 命令 | 说明 |
| :--- | :--- |
| `npm run dev` | 启动本地 Next.js 开发服务器（默认端口 3000） |
| `npm run typecheck` | 执行 TypeScript 严格类型检查 (`tsc --noEmit`) |
| `npm test` | 运行全部单元测试与跨端 E2E 黄金路径测试 |
| `npm run build` | 执行生产构建打包（含静态路由预渲染与代码分割优化） |
| `npm run start` | 启动生产环境构建产物服务器 |

---

## 3. 技术栈与核心架构设计

### 3.1 基础技术栈
- **核心框架**：Next.js 16 (App Router 架构) + React 19 + TypeScript 5
- **样式方案**：Tailwind CSS 4 + CSS 变量设计令牌 (`portal-tokens.css`)
- **动效库**：Framer Motion 13 + 减弱动态效果适配 (`prefers-reduced-motion`)
- **图标系统**：Phosphor Icons (`@phosphor-icons/react`)
- **地图引擎**：高德地图 JSAPI 2.0 (AMap) + MapLibre GL 备用引擎，采用 GCJ-02 真实测绘坐标系

### 3.2 跨端响应式数据架构 (`PortalDemoRepository`)
- **源码位置**：[`web/src/lib/portal/demo-repository.ts`](file:///[local-project-path]
- **实现原理**：
  1. 采用 LocalStorage 进行客户端结构化数据持久化，配合预置六祖镇真实文旅数据种子（[`demo-seed-data.ts`](file:///[local-project-path]
  2. 采用 React 19 标准的 `useSyncExternalStore` 封装了 `usePortalVersion()` 状态版本监听器。
  3. 当商户申报、Studio 审核落图、或游客收藏/导航时，仓储层调用 `saveStorage()` 自动分发 `CustomEvent("yunmap-portal:data-changed")`，全站所有订阅组件零延迟自动响应刷新。
  4. 完全隔离 SSR 与客户端状态差异，彻底免疫 Hydration Mismatch。

### 3.3 内容生命周期状态机 (Content Status Machine)
- **源码位置**：[`web/src/lib/portal/content-status-machine.ts`](file:///[local-project-path]
- **状态流转矩阵**：
  - `draft`（草稿中） ──(商户提交)──► `pending_review`（待审核）
  - `pending_review` ──(Studio通过并落图)──► `published`（已发布，游客端可见）
  - `pending_review` ──(Studio驳回)──► `changes_requested`（待商户修改）
  - `changes_requested` ──(商户重新编辑提交)──► `pending_review`
  - `published` ──(Studio下架)──► `unpublished`（已下架）

### 3.4 角色权限控制 (RBAC)
- **源码位置**：[`web/src/lib/portal/rbac.ts`](file:///[local-project-path]
- **角色矩阵**：
  - `visitor`：仅读权限（浏览已发布内容、收藏、发起导航）
  - `partner`：商户权限（申报活动/地点、查看本商户提交记录、查看本商户经营看盘）
  - `studio`：运营与管理权限（全量内容审核、经纬度微调落图、精选推荐位编排、全域台账）
  - `superadmin`：超级管理员权限（系统全权限）

---

## 4. 三端路由与页面地图 (Route Map)

```
web/src/app/
├── judge/               # 🎛️ 评委演示中枢 (快速角色切换 & 数据重置)
│   └── page.tsx
│
├── partner/             # 🍵 云游伙伴中心 (绿色大地生态风格)
│   ├── layout.tsx       # 伙伴中心专属生态导航布局
│   ├── page.tsx         # 入驻权益介绍与入驻指引首页
│   ├── workbench/       # 商户核心工作台 (经营看板 & 待办清单)
│   ├── activities/new/  # 4步发布文旅体验活动向导
│   ├── resources/new/   # 实体空间与茶园基地申报向导
│   ├── submissions/     # 申报历史全生命周期时间线 (支持退回重新修改)
│   └── insights/        # 曝光/收藏/导航 转化漏斗与事件分析看盘
│
├── studio/              # 🖥️ 云游 Studio 控台 (深色专业调度风格)
│   ├── layout.tsx       # Studio 专业深色控台侧边栏布局
│   ├── page.tsx         # 运营总览看板 (待审数/资源数/互动大盘)
│   ├── reviews/         # 双栏内容审核与高德经纬度落图校准台
│   ├── resources/       # 全域实体地点与空间台账 (上下架开关)
│   ├── activities/      # 全域特色文旅体验活动台账
│   ├── map-editor/      # 地图点位落图校准与坐标微调工作台
│   └── featured/        # 首页与全景地图精选推荐位编排
│
├── explore/             # 🗺️ 游客端：文旅发现流 (分类筛选/当季精选瀑布流)
├── place/[id]/          # 🗺️ 游客端：地点深度详情 (画廊/设施/开放时间/收藏/导航)
├── activity/[id]/       # 🗺️ 游客端：体验深度详情 (排期/票价/主办方/收藏/导航)
├── trip/                # 🗺️ 游客端：轻行程与收藏清单 (离线持久化/一键出发)
└── map/                 # 🗺️ 游客端：高德互动全景大地图 (挂载最新发布文旅卡片)
```

---

## 5. 后续开发与扩展指南 (Next Steps)

如果您需要在此基础上继续开展后续业务开发，推荐按以下步骤进行：

### 5.1 接入真实后端 API 与数据库 (如 PostgreSQL / Supabase)
1. 在 `web/src/lib/portal/demo-repository.ts` 中，目前采用 DemoAdapter 模式（LocalStorage 本地持久化）。
2. 只需将 `PortalDemoRepository` 中的方法（如 `getPlaces`, `saveActivity`, `createSubmission`, `reviewSubmission`）替换为真实的 `fetch('/api/v1/...')` 或 Prisma / Drizzle ORM 查询即可，**三端所有 UI 组件无需做任何改动**！

### 5.2 新增文旅活动分类与字段
1. 在 `web/src/lib/portal/types.ts` 中扩充 `Place` 或 `Activity` 类型字段（如增加 `tags`, `videoUrl`, `ticketTypes` 等）。
2. 在 `web/src/app/partner/activities/new/page.tsx` 的向导步骤中增加对应输入表单项。
3. 在 `web/src/app/activity/[id]/page.tsx` 详情页中渲染新增字段。

### 5.3 接入真实微信/短信登录与真实鉴权
1. 目前演示环境通过 `src/lib/portal/demo-auth-context.tsx` 提供了一键切换角色能力。
2. 接入生产用户系统时，可在 `demo-auth-context.tsx` 中对接 NextAuth.js、Clerk 或自有 JWT / Cookie Session 鉴权。

---

## 6. 文档与参考资料索引

所有设计文档与前期调研均已整理归档于 [`docs/judge-mvp/`](file:///[local-project-path] 目录：
- `00-baseline-audit.md`：基线代码与运行审计报告
- `01-benchmark-research.md`：10+ 行业竞品（高德/AllTrails/美团/Strapi/Mapbox）调研矩阵
- `02-product-strategy-and-mvp-scope.md`：产品战略与 MVP 边界设计
- `03-cross-portal-journey.md`：跨端旅程时序图与状态机规范
- `04-prd-visitor-mvp.md` / `05-prd-studio-mvp.md` / `06-prd-partner-mvp.md`：三端详细 PRD 文档
- `08-ui-design-system-and-wireframes.md`：三端色彩系统与设计规范
- `09-technical-architecture.md` / `10-data-model-api-and-rbac.md`：技术架构与数据模型
- `12-test-and-acceptance-plan.md` / `13-judge-demo-script.md`：测试方案与评委演示脚本
- `14-final-delivery-report.md`：最终交付与验收报告
- `README_JUDGE_MVP.md`：评委现场快速演示指南
