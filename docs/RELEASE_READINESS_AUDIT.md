# P0 发布准备度审计

审计对象是单景区、中文、前台 H5/PWA 的**受控公开测试候选**；这不是生产发布批准，也不证明任何景区事实、路线安全或外部合规事项已经完成。

## 审计基线与证据边界

| 项目 | 当前记录 |
| --- | --- |
| 审计分支 | `audit/p0-release-readiness-20260815` |
| 基线提交 | `5478cd3791304329dd84a7da2e10e60ca3ee3ca5` |
| 当前应用候选 | `376e22e081758a3a76eafb038309be336a17b40f`；新增隔离虚构导航实验室、PWA 安装能力与移动候选壳，不改变正式导航失败关闭边界 |
| 测试与打包收口 | `020b869`；移除 E2E 的仓库外图片/本机密钥依赖，并使 Android 打包缺少显式候选 URL 时失败关闭 |
| 可复现工具链 | Node `24.15.0`、npm `11.12.1`；`package-lock.json` SHA-256 `1c5af460973ee11bc2609548b336cbe9d42dd190dadf1cda0a6315fdb5438f69` |
| 当前代码状态 | 2026-08-16 在 `020b869c6a6927f10fd2fb2b2a430217b856f072` 的干净克隆执行 `npm ci` 与 `verify:demo`：秘密扫描、TypeScript、lint、Node 318/318 和生产构建（30 个路由条目）全部通过 |
| 浏览器 E2E | 2026-08-15 在同一隔离生产构建上全量 Playwright 34/34 通过，耗时约 5.5 分钟；测试不依赖仓库外图片或本机高德密钥，无密钥时验证明确标注的本地安全降级 |
| 候选部署 | Vercel Preview `dpl_44kAXbPy8WGFAd5AZJmRpcUFpRqZ` 状态 `READY`，基础地址受 Vercel Authentication 保护；另生成单个可撤销分享入口供受控测试，未改旧 Production 域名 |
| 受控访问验证 | Chromium 通过分享入口直接显示 `/navigation-lab` 的强制“完全虚构算法演练”确认页，未落入 Vercel 登录；分享参数不写入仓库或文档。该结果不是 Android/iPhone 真机证据 |
| 移动工件 | `mobile/deliverables/liuzu-cloud-tour-preview-020b869-share-debug.apk`，21,983 bytes，SHA-256 `eb2515d022d0dda277d15b868fe1ece835d2d32857009be37824e8af7947ef2f`；仅 `INTERNET`、minSdk 26 / targetSdk 35、v2 debug 签名，未做模拟器或真机安装。iPhone 当前仅有 Safari PWA 路径，无 IPA |
| 演示代码门 | `npm run verify:demo` 已通过；这只证明候选代码门，不构成生产放行 |
| 正式代码门 | `npm run verify:release` 在 `test:db` 连接前停止：未提供一次性 `DATABASE_TEST_URL`、`ALLOW_DATABASE_INTEGRATION_TESTS=1` 与 `DATABASE_TEST_CONFIRM_DISPOSABLE=1`；未连接、迁移或改动任何真实数据库 |
| 严格 P0 证据账本 | 12 条规则、38 个场景中有 49 项非通过，另有 9 项开放外部阻断；账本结论为 `NO_GO` |
| 真 PostGIS / 恢复 | `UNVERIFIED`；未把真实或生产数据库作为本审计证据 |
| 最终结论 | **NO-GO** |

本次只把仓库内可验证的控制改为失败关闭、可测试和可审计的形态。上述隔离候选自动化、受保护 Preview 和 debug APK 都不是生产放行证据；`verify:release` 因本机没有可用的一次性 PostGIS 运行时而未通过 `test:db`，且严格 P0 账本本身仍为 `NO_GO`。与真库、现场、真机、合同和法务有关的发布准备度继续为 `PARTIAL` / `UNVERIFIED`。任何候选变更、分享权限变化或移动重打包后都必须重新取证。

## 已落地的代码证据（均非生产 PASS）

| 控制面 | 代码/测试证据 | 审计状态与边界 |
| --- | --- | --- |
| 发布证据、秘密扫描与严格退出码 | `../scripts/verify-project.mjs`、`../scripts/p0-release-evidence.mjs`、`../scripts/secret-scan.mjs`、`../tests/p0-release-evidence.test.mjs` | `PARTIAL`；隔离候选的构建、类型、lint、Node 与 Playwright 已通过，但证据脚本会在任何非 PASS 或外部阻断存在时返回非零。 |
| PostGIS 数据面与补偿路径 | `../database/migrations/001_initial.sql` 至 `016_route_operational_observations.sql`、`../scripts/verify-postgis.mjs`、`../scripts/verify-postgis-workflows.mjs`、`../scripts/rollback-database.mjs` | `PARTIAL`；N10/N12 自动发现全迁移、拒绝非空/非 test-ci 数据库，执行全量补偿重放，并加入 N6–N12 GIS/运营职责分离、N9 最终写入故障零残留和 N12 动态观测发布探针。临时 PostGIS CI 已配置，但本提交尚无实际真库结果；备份/PITR、恢复与生产最小权限仍未验证。 |
| 正式快照与确定性内部路由 | `../src/lib/directed-route-engine.ts`、`../src/lib/server/formal-routing-service.ts`、`../src/app/api/v1/route-plans/route.ts`、`../tests/directed-route-engine.test.mjs` | `PARTIAL`；没有完整、已发布、有效且现场核验的快照时必须拒绝正式路线，当前没有可放行景区数据。 |
| 封路版本与会话暂停 | `../src/lib/route-operation-monitor.ts`、`../src/lib/use-route-operation-monitor.ts`、`../tests/route-operation-monitor.test.mjs` | `PARTIAL`；15 秒/恢复检查的控制代码不能替代真实封路责任、SLA 或现场复走。 |
| 偏航/版本变化自动重路由 | `../src/lib/formal-navigation-reroute.ts`、`../src/lib/route-operation-monitor.ts`、`../src/components/FormalNavigationPlanner.tsx`、`../tests/formal-navigation-reroute.test.mjs`、`../tests/e2e/formal-auto-reroute.spec.ts` | `PARTIAL`；旧指令先停、新鲜定位仅在设备内匹配正式节点、完整快照与新路线精确绑定、会话顺序和失败关闭已编码；真机 GNSS、多路径环境、正式节点密度、弱网、现场偏航/封路与反复重算稳定性未验证。 |
| 路段语义指令与定位置信度 | `../src/lib/formal-navigation-runtime.ts`、`../src/lib/formal-navigation-map-state.ts`、`../src/components/FormalNavigationMap.tsx`、`../tests/formal-navigation-runtime.test.mjs`、`../tests/formal-navigation-map.test.mjs` | `PARTIAL`；曲线造型点不再生成虚假转向、剩余距离/进度逐边计算、精度圈三态显示与不可靠箭头隐藏已编码；正式边分段/量测、代表性真机、多路径环境、可访问性理解和现场口令核验未完成。 |
| 进度连续地图匹配与反向行走 | `../src/lib/formal-navigation-runtime.ts`、`../src/components/FormalNavigationPlanner.tsx`、`../tests/formal-navigation-runtime.test.mjs`、`../tests/e2e/formal-auto-reroute.spec.ts` | `PARTIAL`；初次重叠最早安全进度、移动/精度连续性包络、连续远端分支重算、最远进度水位、三点反向掉头提示和恢复滞回已编码；正式复杂拓扑、设备/浏览器差异、坡地/交通段、真机多路径和现场正反向复走未完成。 |
| 动态已走/剩余路线地图 | `../src/lib/formal-navigation-route-display.ts`、`../src/components/FormalNavigationMap.tsx`、`../src/components/FormalNavigationPlanner.tsx`、`../tests/formal-navigation-route-display.test.mjs` | `PARTIAL`；精确匹配点拆分、灰/蓝双线、剩余交通段裁剪、终点清空、拓扑漂移隐藏与暂停恢复进度保留已编码；正式长路线、多模式换乘、真机渲染性能、缩放/旋转、强光/色觉/读屏与现场理解未完成。 |
| 导航地图相机状态 | `../src/lib/formal-navigation-map-camera.ts`、`../src/components/FormalNavigationMap.tsx`、`../tests/formal-navigation-map-camera.test.mjs`、`../tests/e2e/formal-auto-reroute.spec.ts` | `PARTIAL`；可靠定位跟随、手势浏览、剩余路线总览、连续 GPS 不抢回、显式回中、低精度/停止不移动及减少动态已编码；代表性手机/浏览器、多点触控、系统缩放、旋转、前后台、低端 GPU、读屏和现场理解未完成。 |
| 导航页面生命周期 | `../src/lib/formal-navigation-page-lifecycle.ts`、`../src/components/FormalNavigationPlanner.tsx`、`../tests/formal-navigation-page-lifecycle.test.mjs`、`../tests/e2e/formal-auto-reroute.spec.ts` | `PARTIAL`；后台去重暂停、定位监听清理、重算定位清除、后台异步激活阻断、前台正式快照复核、显式恢复与新鲜定位门已编码；代表性真机锁屏/BFCache/系统回收、浏览器节流、权限变化、弱网和现场恢复未完成。 |
| 前台确定性关键语音 | `../src/lib/formal-navigation-voice.ts`、`../src/components/FormalNavigationPlanner.tsx`、`../tests/formal-navigation-voice.test.mjs`、`../tests/e2e/formal-navigation-voice.spec.ts` | `PARTIAL`；显式开启、全局静音、路线指纹/正式道路边绑定、距离分档去重、后台/暂停/定位退化/偏航/版本失效取消旧播报和有界安全提示已编码；代表性真机、Safari/Chrome/微信内置浏览器、音频焦点、耳机/蓝牙、来电、静音区、噪声、中文发音及现场理解未完成。 |
| 紧急道路管制与独立复核 | `../database/migrations/012_route_closure_control.sql`、`../src/lib/server/route-operations-service.ts`、`../src/lib/server/route-operations-repository.ts`、`../src/components/RouteOperationsWorkbench.tsx`、`../tests/route-operations-workflow.test.mjs` | `PARTIAL`；当前正式边绑定、立即失败关闭、幂等/revision、不同身份确认/撤回与追加审计已编码，N8 已另行补齐替代快照软件链；真 PostGIS、生产身份、官方事件源、值班 SLA、真实轮转和现场演练未完成。 |
| 替代运营快照与安全重算 | `../database/migrations/013_route_operational_snapshot_release.sql`、`../database/migrations/016_route_operational_observations.sql`、`../src/lib/route-operational-release-compiler.ts`、`../src/lib/server/route-operational-release-repository.ts`、`../src/components/RouteOperationalReleasePanel.tsx`、`../tests/route-operational-release.test.mjs` | `PARTIAL`；全边服务器编译、确认事件/观测精确绑定、摘要、准备/发布分离、全集复核和原子 version 替换已编码；真 PostGIS 实跑、生产身份、官方来源、轮转/离线再签 SLA 与现场演练未完成。 |
| 客流/天气动态观测 | `../database/migrations/016_route_operational_observations.sql`、`../src/lib/server/route-operational-observation-repository.ts`、`../src/components/RouteOperationalObservationWorkbench.tsx`、`../tests/route-operational-observation.test.mjs` | `PARTIAL`；最长六小时、当前快照/正式开放边绑定、提交/复核职责分离、追加审计、倍率约束与游客逐段披露已编码；正式传感器/人工采样责任源、校准与代表性、真实多人、真库实跑、SLA 和现场真机未完成。 |
| GIS 正式化与原子发布 | `../database/migrations/014_gis_formalization_release.sql`、`../src/lib/gis-formalization-compiler.ts`、`../src/lib/server/gis-formalization-repository.ts`、`../src/components/GisFormalizationWorkbench.tsx`、`../tests/gis-formalization.test.mjs` | `PARTIAL`；精确双层拓扑、逐路径方向、提交/审核/准备/发布分离、重载重编译、活动管制阻断和单事务正式写入已编码；真 PostGIS、官方 GIS/许可、生产身份、真实多人、现场复走/开放确认、离线撤回传播与管理签字未完成。 |
| 景区交通多模式路由 | `../database/migrations/015_scenic_transport_routing.sql`、`../src/lib/directed-route-engine.ts`、`../src/lib/formal-navigation-runtime.ts`、`../src/components/FormalNavigationPlanner.tsx` | `PARTIAL`；索道/观光车默认关闭、显式选择、独立服务时长/证据、分段指令和运营状态门已编码；官方线路、班次、上下客点、票价/排队边界、无障碍、真库及现场运营核验未完成。 |
| 游记抽取、行程 revision、游览会话 | `../src/app/api/v1/itinerary-extractions/route.ts`、`../src/lib/server/itinerary-revision-service.ts`、`../src/app/api/v1/visit-sessions/route.ts`、`../tests/visit-session-service.test.mjs` | `PARTIAL`；隔离候选 E2E 已通过，但真库、跨设备和已发布 POI/开放规则证据仍缺失。 |
| 私密分享与数据主体权利 | `../src/app/api/v1/shared-routes/resolve/route.ts`、`../src/lib/server/share-link-resolve.ts`、`../src/lib/server/visitor-data-rights-service.ts`、`../tests/visitor-data-rights-service.test.mjs` | `PARTIAL`；fragment/POST/no-store 与导出/删除控制已编码，仍未获得真环境日志、缓存和删除履约证据。 |
| AI、readiness、后台失败关闭 | `../src/lib/ai-guide/gemini.server.ts`、`../src/lib/ai-guide/service.server.ts`、`../src/lib/server/readiness.ts`、`../src/lib/server/admin-oidc-rbac.server.ts` | `PARTIAL`；远程模型默认关闭，生产身份、已审核知识、告警与运营控制面尚无真环境证据。 |

## 十二条放行规则

只有下列十二项均在同一最终发布版本有版本化证据时才可判定 `GO`。当前每项均未关闭。

1. 可复现提交、锁文件、Node/npm 版本、秘密扫描以及全部代码门通过。
2. 正向迁移、补偿/回滚、真 PostGIS 集成、备份/PITR 与恢复演练通过。
3. 景区边界、入口、POI、路网和运营快照有来源、权利、审核、有效期和现场核验。
4. 有向路线、单向/无障碍/封路/过期状态均由确定性计算，无安全路线时停止导航。
5. 双向复走、弱网、定位、无障碍、静音区、音频和应急演练获得管理方及独立审核签字。
6. 定位、导出/删除、同意、会话撤销和私密分享安全在真环境通过。
7. OIDC、MFA、RBAC、审计、紧急封路/通知及内容回滚在真环境验证。
8. AI 只使用已审核且未撤回的知识；远程模型合规、质量和持久限流门通过。
9. 可观测性、告警回执、值班、备份/PITR、恢复和部署回滚演练通过。
10. 地图、AI、云、数据库、素材与内容的合同、权利和数据处理安排已核验。
11. ICP/App/公安备案、等保判断、隐私政策、用户协议、SDK、未成年人和投诉机制完成适用审核。
12. 发布审批人已审阅本审计、覆盖矩阵、现场证据与已知限制，且没有非 `PASS` 项或外部阻断。

## 九项外部 `LEGAL/COMPLIANCE BLOCKER`

下列事项不能由代码关闭，且任一存在都维持 **NO-GO**：

1. 官方 GIS、景区边界/入口/路网/设施/风险/开放数据及发布权。
2. 路线安全的双向现场复走、定位与无障碍核验、独立 GIS/安全签字。
3. 实时封路、风险和紧急状态的责任人、更新 SLA、预授权和事后复核机制。
4. 景区管理方及宗教/文化内容、静音区和导览策略审核。
5. 图片、音频、字体、IP、地图数据和其他素材的完整权利链。
6. 生产数据库、可信 OIDC/MFA、告警接收器、值班、备份/PITR 与恢复证据。
7. 地图、AI、云、数据库等供应商合同、配额、数据处理和地域安排。
8. ICP/App/公安备案以及等保适用性判断和网络安全责任。
9. 隐私政策、用户协议、SDK 清单、未成年人、投诉机制与法律审核。

详细场景状态见 [FEATURE_COVERAGE_MATRIX.md](FEATURE_COVERAGE_MATRIX.md)，代码整改边界见 [P0_GAP_AND_IMPLEMENTATION_PLAN.md](P0_GAP_AND_IMPLEMENTATION_PLAN.md)。
