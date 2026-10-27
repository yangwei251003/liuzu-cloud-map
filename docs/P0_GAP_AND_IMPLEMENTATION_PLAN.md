# P0 缺口与整改计划

本文件把“仓库内已加入的控制”与“仍须项目方取证的事实”分开。`PARTIAL` 仅表示控制代码或测试入口存在，不表示可公开导航、更不表示生产可放行。

## 代码整改进度

| 优先级 | 当前代码整改 | 可复核路径 | 当前状态与剩余证据 |
| --- | --- | --- | --- |
| P0-1 | 基线、秘密路径扫描、严格发布证据、错误边界 | `../scripts/secret-scan.mjs`、`../scripts/verify-project.mjs`、`../src/app/error.tsx` | `PARTIAL`；2026-08-15 干净隔离候选构建、TypeScript、lint、Node 318/318 与 Playwright 34/34 已通过，但严格生产证据仍未闭合。 |
| P0-2 | WGS84 数据契约、有向路线、版本化封路、快照不足即拒绝、受约束自动重路由、路段语义口令、进度连续匹配、动态剩余路线、相机控制、页面生命周期恢复与前台关键语音 | `../database/migrations/003_p0_control_plane.sql`、`../src/lib/directed-route-engine.ts`、`../src/lib/formal-navigation-runtime.ts`、`../src/lib/formal-navigation-route-display.ts`、`../src/lib/formal-navigation-map-camera.ts`、`../src/lib/formal-navigation-page-lifecycle.ts`、`../src/lib/formal-navigation-voice.ts`、`../src/lib/formal-navigation-reroute.ts` | `PARTIAL`；N19 已完成正式边界转向、逐边剩余量、定位精度圈、连续匹配/反向掉头、精确灰/蓝路线、剩余交通段裁剪、相机三态、后台暂停/前台复核/显式恢复，以及显式开启且失败关闭的路线修订语音，当前工作树 481/481 Node/契约、39 页面构建及 N13–N19 导航/语音专项浏览器 10/10；仍无官方数据、真库、正式复杂拓扑/量测、代表性真机、语音兼容和现场证据。 |
| P0-3 | 模型只提取文本、后端目录匹配、revision 与游览会话状态机 | `../src/app/api/v1/itinerary-extractions/route.ts`、`../src/lib/server/itinerary-revision-service.ts`、`../src/app/api/v1/visit-sessions/route.ts` | `PARTIAL`；隔离候选浏览器闭环已通过，已发布 POI/开放规则和真库证据仍缺失。 |
| P0-4 | fragment 私密分享、POST 解析、导出/删除/同意、最小化数据模型 | `../src/app/api/v1/shared-routes/resolve/route.ts`、`../src/lib/server/visitor-data-rights-service.ts`、`../public/sw.js` | `PARTIAL`；真环境 Referer、缓存、日志、撤销和删除履约待取证。 |
| P0-5 | 生产后台 OIDC/MFA/RBAC 默认拒绝、审计/版本化数据表 | `../src/lib/server/admin-oidc-rbac.server.ts`、`../database/migrations/003_p0_control_plane.sql` | `PARTIAL`；无可信 IdP、真实角色绑定、运营授权或审计保全证据。 |
| P0-6 | 审核知识边界、严格 JSON Schema、逐声明来源、远程模型关闭门 | `../src/lib/ai-guide/gemini.server.ts`、`../src/lib/ai-guide/service.server.ts`、`../tests/ai-quality-golden-set.test.mjs` | `PARTIAL`；知识审核、模型合规/合同、持久限流和最终质量证据缺失。 |
| P0-7 | readiness、脱敏观测接口、迁移/回滚/重放脚本与 CI 入口 | `../src/app/api/readiness/route.ts`、`../src/lib/server/observability.ts`、`../scripts/verify-postgis.mjs` | `PARTIAL`；真库、告警、备份/PITR、恢复与部署回滚演练未执行。 |

## 最终证据生成顺序

最终合并后必须在隔离环境重新执行并归档：

1. 2026-08-15 干净隔离候选的生产构建、TypeScript、lint（零错误）与 Node 测试（318/318）已通过；任何后续候选变更必须重新运行并归档。
2. 带**一次性、非生产** `DATABASE_TEST_URL`、`ALLOW_DATABASE_INTEGRATION_TESTS=1` 与 `DATABASE_TEST_CONFIRM_DISPOSABLE=1` 的 `npm run test:db`。N10/N12 验证器自动覆盖全部 16 个迁移、全量回滚/重放、N6–N12 并发幂等和职责分离、虚构动态观测完整快照发布，以及 N9 最后快照插入失败后的零残留；数据库名必须含 `test`/`ci` 且必须为空。当前本机未提供可用 PostGIS，`npm run verify:release` 在连接前停止；没有连接或改动任何真实数据库。
3. 2026-08-15 同一隔离生产构建的全量浏览器 E2E 已 34/34 通过（约 5.5 分钟），并覆盖无高德密钥时的明确降级；此结果不能替代真库、真机、现场或生产环境证据，且候选变更后必须重新运行。
4. `npm run p0:release-evidence` 和 `npm run verify:release`。当前严格账本输出为 12 条规则、38 个场景、49 项非通过与 9 项开放外部阻断，结论 `NO_GO`；它们必须在任何 `MISSING`、`BROKEN`、`MOCK`、`UNVERIFIED`、`PARTIAL` 或外部阻断存在时非零退出。

即使代码验证全部完成，真 PostGIS、现场、法律、供应商和运营证据仍由项目方闭环；详见 [RELEASE_READINESS_AUDIT.md](RELEASE_READINESS_AUDIT.md)。

## 不在 P0

签名原生 App、公开社区与公开 UGC、AR、游戏、多景区、付费商品以及未批准的长期供应商均不在本次范围。新增 Android Web 壳和 Safari PWA 仅是受控候选载体；候选地图、虚构演练、公开 POI 或外跳 URI 不能作为正式内部路线的替代。
