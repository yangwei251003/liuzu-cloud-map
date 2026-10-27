# 技术架构与数据交互设计

## 1. 整体技术分层

```text
┌─────────────────────────────────────────────────────────────┐
│                       三端视图表现层                          │
│  [游客端 Web/Mobile]      [云游 Studio]      [云游伙伴中心]   │
│  Next.js 16 App Router  Tailwind CSS 4     Framer Motion 13 │
└──────────────┬──────────────────┬──────────────────┬────────┘
               │                  │                  │
┌──────────────▼──────────────────▼──────────────────▼────────┐
│                      共享前端领域与组件层                     │
│  • 统一状态机 (ContentStateMachine)                          │
│  • 角色权限守卫 (PortalRBAC & AuthContext)                   │
│  • 地图底盘封装 (AmapLoader / Terra-Draw 点位拾取)             │
│  • 视觉 Token (CSS Variables: Moon White, Pine, Route Gold) │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    数据访问抽象层 (Repository)                │
│  PlaceRepository / ActivityRepository / SubmissionRepository│
│  MetricEventRepository / OrganizationRepository             │
└──────────────┬──────────────────────────────────────────────┘
               │ (通过 Demo Adapter 或 Server Adapter 适配)
┌──────────────▼──────────────────────────────────────────────┐
│                     持久化存储实现 (Storage)                  │
│  • Demo Adapter: 浏览器 IndexedDB + LocalStorage (三端同源)  │
│  • Server Adapter: PostgreSQL + PostGIS (生产就绪接口契约)   │
└─────────────────────────────────────────────────────────────┘
```

## 2. 状态机与 RBAC 访问控制

### 权限矩阵定义
- `VISITOR`：只读 `PUBLISHED` 内容，可写 `MetricEvent`、本地 `Favorites`。
- `PARTNER`：读写所属 `Organization` 的 `DRAFT` 和 `CHANGES_REQUESTED`，可执行 `SUBMIT`，不可执行 `PUBLISH`。
- `STUDIO`：读取所有 `PENDING_REVIEW`，执行 `APPROVE`、`PUBLISH`、`REQUEST_CHANGES`、`REJECT`、`UNPUBLISH`，修改点位与推荐位。
