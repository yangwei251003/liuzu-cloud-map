# MVP 决策日志 (DECISION_LOG.md)

| 决策 ID | 决策项 | 选择方案 | 决策依据与理由 |
| :--- | :--- | :--- | :--- |
| **DEC-001** | 数据持久化方案 | 浏览器端 Repository (LocalStorage/IndexedDB) + 内存单例 | 原项目 PostgreSQL 未在本地容器常驻，浏览器端 Repository 保证三端同源同域共享数据且支持即时重置。 |
| **DEC-002** | 演示认证机制 | Demo 角色切换器 (`AuthContext`) | 演示时避免繁琐的短信验证码或密码阻断，一键自由在游客/商户/管理员之间切换。 |
| **DEC-003** | 地图引擎统一 | 统一使用高德地图 (AMap Web API) | 已有封装稳定成熟，且支持中文国内道路路线规划与精准导航。 |
| **DEC-004** | 代码目录结构 | 单一 Next.js App Router 仓库下的 Route Groups | 最小侵入性，共享 Tailwind Token 与 Lib，不破坏任何原有路由。 |
