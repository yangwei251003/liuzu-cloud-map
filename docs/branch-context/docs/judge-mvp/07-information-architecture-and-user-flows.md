# 信息架构与三端路由规范

## 1. 统一路由表架构 (Unified Route Table)

```text
/                  [游客端] 首页（文化精选 + 快速探索）
/map               [游客端] 全景导览地图（高德地图底盘 + 动态图层）
/explore           [游客端] 发现文旅资源与最新活动
/place/:id         [游客端] 地点详情卡片与导航
/activity/:id      [游客端] 活动详情卡片与导航
/trip              [游客端] 收藏清单与轻行程
/account           [游客端] 游客偏好与设置

/studio            [Studio] 运营仪表盘
/studio/reviews    [Studio] 审核中心（待审核/已通过/需修改）
/studio/resources  [Studio] 全域地点与资源管理
/studio/activities [Studio] 文旅活动管理
/studio/map-editor [Studio] 地图落图与空间点位校准
/studio/featured   [Studio] 首页与地图推荐位编排

/partner           [Partner] 伙伴中心首页（入驻说明与入口）
/partner/workbench [Partner] 商户工作台
/partner/resources/new  [Partner] 新建商户资源（分步向导）
/partner/activities/new [Partner] 新建商户活动（分步向导）
/partner/submissions    [Partner] 提交记录与审核状态时间线
/partner/insights       [Partner] 基础数据分析看盘

/judge             [演示专属] 评委演示导航台与一键数据重置
```

---

## 2. 三端 Sitemap 与布局模型

```text
RootLayout (全局字体、设计 Token、无障碍环境)
├── 游客端布局 (保留现有 AppFrame / MobileTaskNav，强化底部抽屉与沉浸地图)
├── Studio 端布局 (/studio/layout.tsx 桌面双栏侧边栏工作台 + 操作顶部栏)
├── Partner 端布局 (/partner/layout.tsx 温暖卡片式工作流 + 分步导航栏)
└── Judge 演示布局 (/judge/layout.tsx 角色快速切换条 + 演示数据重置浮窗)
```
