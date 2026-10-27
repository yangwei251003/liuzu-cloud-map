# 功能与 38 场景覆盖矩阵

状态依据：`PASS` / `PARTIAL` / `MISSING` / `BROKEN` / `MOCK` / `UNVERIFIED`。本矩阵是发布证据清单，不以旧 104 项演示账本替代；以下是 2026-08-15 P0 代码整改后的当前状态，`PARTIAL` 绝不等于允许发布。

## 用户要求 A–N

| 范围 | 当前目标 | 当前状态 | 必需证据 |
| --- | --- | --- | --- |
| A 地图/GIS | 单景区 WGS84 权威数据与同源双皮肤 | MISSING | 发布快照、许可、现场签字 |
| B 路线 | 有向、封路、无障碍、无安全路线即停止 | PARTIAL | 算法/真库/现场 |
| C 定位导航 | 前台定位、精度/偏航/弱网安全暂停 | PARTIAL | 真机 E2E、现场 |
| D 游记行程 | 提取、POI 匹配、编辑 revision、重算 | PARTIAL | API/状态机 |
| E 导览讲解 | 显式开启、审核音频/文字、静音区策略 | PARTIAL | 内容审核、真机 |
| F 紧急帮助 | 已核验号码/出口/服务点和纠错渠道 | MISSING | 景区确认 |
| G 身份 | 访客账号、会话、导出、删除 | PARTIAL | 真库、隐私审核 |
| H 分享 | 仅登录私密、七天、可撤销/删除 | PARTIAL | 跨设备真库 |
| I 后台 | OIDC/MFA/RBAC、版本、审计、紧急发布 | PARTIAL | IdP、运营签字 |
| J AI/RAG | 审核知识、Schema、逐声明来源、撤回 | PARTIAL | 质量/合规门 |
| K 离线 | 仅自有获批数据；状态过期即停止 | MISSING | 数据权利、弱网测试 |
| L 无障碍 | 缩放、键盘、读屏、非颜色状态 | PARTIAL | 自动化/人工测试 |
| M 运维 | readiness、告警、恢复、回滚 | PARTIAL | 真环境演练 |
| N 合规 | 备案、合同、隐私、内容与文化审核 | MISSING | 项目方文件 |

## 38 指定场景

| # | 场景 | 当前状态 | 目标证据 |
| --- | --- | --- | --- |
| 1 | 定位许可/拒绝/撤回 | PARTIAL | 真机与隐私测试 |
| 2 | 低精度、跳点和异常样本暂停 | PARTIAL | 定位滤波测试 |
| 3 | 偏航滞回与人工恢复 | PARTIAL | 真机路线测试 |
| 4 | 前台/后台/锁屏边界 | UNVERIFIED | 真机记录 |
| 5 | 网络恢复后状态校验 | PARTIAL | 浏览器 E2E |
| 6 | 封路版本变化暂停旧指令 | PARTIAL | 路由/运营测试 |
| 7 | 无安全替代路线转人工求助 | PARTIAL | 路由/现场 |
| 8 | 单向/反向路由 | PARTIAL | 有向图测试 |
| 9 | 台阶/坡度/无障碍过滤 | PARTIAL | GIS/现场 |
| 10 | 标准与禅意皮肤路线完全相同 | PARTIAL | 几何哈希测试、已发布快照 |
| 11 | 高德仅展示，不生成内部路线 | PARTIAL | 静态/API 测试 |
| 12 | 离线数据过期停止导航 | PARTIAL | 离线真机、已发布离线包 |
| 13 | 游记原始地点与后端 POI 匹配 | PARTIAL | API 测试 |
| 14 | 未知地点保持待确认 | PARTIAL | 提取测试 |
| 15 | 开放/时间冲突由后端判定 | PARTIAL | 真库集成 |
| 16 | 编辑后新 revision 强制重算 | PARTIAL | 状态机 |
| 17 | 开始/暂停/继续/恢复 | PARTIAL | 会话测试 |
| 18 | 跳过/到达/结束/历史/删除 | PARTIAL | 会话测试 |
| 19 | ETA、转向与距离 | PARTIAL | 路由测试 |
| 20 | 自动讲解默认关闭、显式开启 | PARTIAL | E2E |
| 21 | 驻留、冷却、快穿、静音区 | PARTIAL | 讲解状态测试 |
| 22 | 音频失败回退审核文字/来源 | PARTIAL | 浏览器测试 |
| 23 | 不保存连续精确轨迹 | PARTIAL | 数据图与测试 |
| 24 | 本机数据清理 | PARTIAL | 浏览器测试 |
| 25 | 跨设备保存须登录 | PARTIAL | 真库身份测试 |
| 26 | 私密分享 token 不进 URL/缓存/日志 | PARTIAL | 安全/E2E |
| 27 | 分享撤销、删除、过期跨设备生效 | PARTIAL | 真库集成 |
| 28 | 账号数据导出最小化 | PARTIAL | 真库集成 |
| 29 | 事务化账号注销和会话撤销 | PARTIAL | 真库集成 |
| 30 | 同意记录/撤回 | PARTIAL | 真库集成 |
| 31 | IDOR/CSRF/越权拒绝 | PARTIAL | API 安全测试 |
| 32 | 恶意公开 UGC 上传入口保持关闭 | PASS | 路由/权限测试 |
| 33 | 精确位置不进入日志/训练 | PARTIAL | 日志审计 |
| 34 | 管理员审核、回滚和追加审计 | PARTIAL | 真身份/真库 |
| 35 | WGS84/GCJ-02 不一致检测 | PARTIAL | 控制点测试 |
| 36 | 弱网/断网的安全降级 | PARTIAL | 真机现场 |
| 37 | 地图/AI/语音依赖故障分级 | PARTIAL | readiness/E2E |
| 38 | 200%/400%、键盘、读屏和触控 | PARTIAL | a11y 验收 |

`PASS` 不等于生产 GO：所有 `PARTIAL`、`MISSING`、`MOCK`、`UNVERIFIED` 以及外部阻断均会使 `verify:release` 失败。

## 已落地的代码证据（仍非 PASS）

- 版本化 PostGIS 数据面、补偿脚本、确定性有向路由与 15 秒运营状态监控：`database/migrations/003_p0_control_plane.sql`、`src/lib/directed-route-engine.ts`、`src/lib/route-operation-monitor.ts`。
- 最快/最短/观光策略、道路类型/难度/观光证据、拥堵与天气耗时倍率、一次高精度节点匹配，以及服务端重放路线、revision/幂等并只存 50 米进度档位的私有导航历史：`database/migrations/005_scenic_navigation_intelligence.sql`、`database/migrations/010_navigation_session_lifecycle.sql`、`src/lib/directed-route-engine.ts`、`src/components/FormalNavigationPlanner.tsx`、`src/lib/server/navigation-session-service.ts`。索道/观光车另由第十五号迁移和显式游客选择约束，不能按普通步行边静默采用。这些仍需正式属性、运营数据、真 PostGIS、生产身份和真机现场证据，因此保持 `PARTIAL`。
- 已授权时自动节点匹配、路线 traversal 与 120 米走廊双重约束的沿途推荐，以及正式 POI—地点社区一对一绑定和 24 小时审核摘要：`src/components/FormalNavigationPlanner.tsx`、`src/lib/formal-route-recommendations.ts`、`src/lib/server/social-api.server.ts`、`database/migrations/009_formal_place_communities.sql`。缺真数据、内容治理和现场证据，仍保持 `PARTIAL`。
- 私密分享 fragment/POST 解析、数据主体权利、版本化行程与游览会话：`src/lib/server-route-share.ts`、`src/lib/server/visitor-data-rights-service.ts`、`src/lib/server/itinerary-revision-service.ts`、`src/lib/server/visit-session-service.ts`。
- 发布知识的确定性问答、正式快照/路线 API、远程模型关闭门和失败关闭后台 OIDC/RBAC：`src/app/api/v1/guide/answers/route.ts`、`src/app/api/v1/route-plans/route.ts`、`src/lib/server/admin-oidc-rbac-domain.ts`。
- 管理端候选 GIS 已具备租户内版本化提交、规范化内容哈希、不可变对象/事件、同源有界幂等 API、可信边缘身份断言、OIDC/MFA/数据库角色与提交人—审核人分离；待审列表/详情再次做租户、数量、结构和摘要复核，`/admin/gis-review` 提供候选空间/来源/属性审阅与证据决策；批准只进入待正式化，不直写正式路网：`database/migrations/011_gis_draft_review_workflow.sql`、`src/lib/server/gis-draft-submission-service.ts`、`src/lib/server/gis-draft-submission-repository.ts`、`src/components/MapDraftEditor.tsx`、`src/components/GisDraftReviewWorkbench.tsx`。缺真库、生产身份、多人/专业 GIS 演练、管理发布和现场证据，因此后台仍为 `PARTIAL`。
- 正式道路紧急管制已具备当前快照/开放边绑定、最长七天有效期、HTTPS 双证据、重叠检查、幂等、`OPERATIONS_EMERGENCY` 立即阻断、不同 subject 的 `RELEASE_ADMIN` 事后确认/撤回和追加审计；`/admin/route-operations` 按角色开放操作。撤回事件不声明道路开放，没有新运营快照时不猜测绕行：`database/migrations/012_route_closure_control.sql`、`src/lib/server/route-operations-service.ts`、`src/lib/server/route-operations-repository.ts`、`src/components/RouteOperationsWorkbench.tsx`。缺真库、生产身份、官方事件源、值班 SLA、真实多人和现场演练，场景 6、34 与后台仍保持 `PARTIAL`。
- 已确认管制现在可由服务器从当前正式快照编译成全边运营状态候选：精确事件绑定、稳定摘要、短有效期、准备/发布 subject 分离、发布前事件全集复核和旧/新快照单事务切换；导航按 version 变化重算，旧离线包必须失效。客户端没有提交几何或边状态的通道：`database/migrations/013_route_operational_snapshot_release.sql`、`src/lib/route-operational-release-compiler.ts`、`src/lib/server/route-operational-release-repository.ts`、`src/components/RouteOperationalReleasePanel.tsx`。缺真 PostGIS、生产身份、官方事件源、真实多人、轮转/离线再签 SLA 与现场绕行/恢复演练，场景 6、7、12、34 仍保持 `PARTIAL`。
- 已审核 GIS 现在可进入独立正式化/管理发布链：路径逐条声明公共/内部层与方向，按精确顶点确定性构图，入口双层、POI/设施内部顶点和有向可达性失败即阻断；提交、原审核、正式化准备和发布身份分离。发布前服务器重载重编译并调用正式路网/运营状态校验，活动封路或待发布运营候选禁止全开放覆盖；单事务撤下旧快照/旧在线离线包并写入正式来源、publication、路网、POI、初始运营状态和新快照：`database/migrations/014_gis_formalization_release.sql`、`src/lib/gis-formalization-compiler.ts`、`src/lib/server/gis-formalization-repository.ts`、`src/components/GisFormalizationWorkbench.tsx`。缺真 PostGIS、官方 GIS/许可、生产身份、真实多人、现场复走/开放确认与离线撤回传播，A、B、I、K 和场景 6、8–10、12、34–36 仍不是生产 `PASS`。
- N10 真库门已从固定三项迁移升级为自动发现当前全部迁移，强制一次性空 `test`/`ci` 数据库和第三重明确确认；它执行全量迁移—补偿—重放，并用虚构数据验证 N6–N12 并发幂等、GIS/运营职责分离、不可变触发器、N9 最终快照写入故障后的整笔事务零残留，以及 N12 观测复核和动态快照原子发布：`scripts/verify-postgis.mjs`、`scripts/verify-postgis-workflows.mjs`、`.github/workflows/release-gate.yml`。本机尚未实际运行真 PostGIS，且该门不覆盖生产最小权限、备份/PITR、容量、官方数据或现场安全，所以相关场景仍为 `PARTIAL` / `UNVERIFIED`。
- N11 把 `CABLEWAY` / `SHUTTLE` 从道路标签升级为显式选择的交通段：严格服务名称、上车/等候/乘坐时长和 HTTPS 班次依据；正式化只接受两端点交通路径；路线携带服务证据并输出上车、乘坐、下车指令，ETA 按交通段计时：`database/migrations/015_scenic_transport_routing.sql`、`src/lib/gis-formalization-compiler.ts`、`src/lib/directed-route-engine.ts`、`src/lib/formal-navigation-runtime.ts`、`src/components/FormalNavigationPlanner.tsx`。当前没有官方交通线路、时刻/运营、票价、排队、上下客点或无障碍现场证据，B、C、I 和场景 9、19、34–36 仍为 `PARTIAL` / `UNVERIFIED`。
- N12 把既有静态 `travelTimeMultiplier/crowdLevel/weatherImpact` 消费能力补成受控生产链：最长六小时的一手观测、`OPERATIONS_EDITOR`/`OPERATIONS_REVIEWER` 分离、当前快照绑定、追加审计、每边最新确认值、完整快照编译、精确 ID/哈希绑定和发布前全集复核；游客路线逐段披露正式倍率/客流/天气：`database/migrations/016_route_operational_observations.sql`、`src/lib/server/route-operational-observation-repository.ts`、`src/lib/server/route-operational-release-repository.ts`、`src/components/RouteOperationalObservationWorkbench.tsx`、`src/components/FormalNavigationPlanner.tsx`。当前没有六祖镇正式采样源、校准/代表性、值班 SLA、真库实跑或现场证据，B、C、I、K 和场景 6、7、12、34–36 仍为 `PARTIAL` / `UNVERIFIED`。
- N13 把确认偏航与正式路网/运营版本变化接入自动确定性重路由：旧指令先停，10 秒内且不高于 35 米精度的 GPS 只在设备内匹配正式节点，路线请求只提交节点 ID、原策略/偏好和精确版本；系统重取完整线上快照或再次验证已安装离线包，替代路线须具有新指纹并精确匹配全部绑定，安全失败则保持 `REROUTE_REQUIRED`。导航会话按队列记录 `REROUTE_REQUIRED → REROUTED`，不会上传坐标/几何/轨迹：`src/lib/formal-navigation-reroute.ts`、`src/lib/route-operation-monitor.ts`、`src/components/FormalNavigationPlanner.tsx`、`tests/formal-navigation-reroute.test.mjs`、`tests/e2e/formal-auto-reroute.spec.ts`。缺真机 GNSS、多路径环境、正式节点密度、现场偏航/封路与弱网证据，C、I、K 和相关导航场景仍为 `PARTIAL` / `UNVERIFIED`。
- N14 修复逐向指令的道路语义：运行时用 traversal 边界而不是折线造型点生成下一转向，按当前正式边剩余距离加后续边总量计算剩余距离/进度，ETA 继续沿用逐边计算；地图以临时 WGS84 点绘制浏览器报告的精度圈，可靠/待确认/停止三态变色，不可靠时隐藏旧方向箭头：`src/lib/formal-navigation-runtime.ts`、`src/lib/formal-navigation-map-state.ts`、`src/components/FormalNavigationMap.tsx`、`tests/formal-navigation-runtime.test.mjs`、`tests/formal-navigation-map.test.mjs`。缺正式边分段质量、距离量测、代表性真机和现场口令核验，B、C、L 与场景 2、19、35、38 仍为 `PARTIAL` / `UNVERIFIED`。
- N15 修复回头线、重叠线与空间相邻远端分支的地图匹配歧义：投影候选先通过进度连续性包络，初次重叠从最早安全进度起算；连续三次不连续分支匹配停止旧指令并进入确定性重算。走廊内相对最远已达进度连续反退三次且扣除精度后超过 20 米时显示 `WRONG_WAY`/掉头，回到 8 米恢复带后解除；这些 tracker 字段和 GPS 一样只在设备内存：`src/lib/formal-navigation-runtime.ts`、`src/components/FormalNavigationPlanner.tsx`、`tests/formal-navigation-runtime.test.mjs`、`tests/e2e/formal-auto-reroute.spec.ts`。缺正式复杂拓扑、真机多路径与现场正反向复走，B、C、L 与场景 2、3、19、35、36、38 仍为 `PARTIAL` / `UNVERIFIED`。
- N16 将“剩余路线”从数字升级为地图几何状态：运行时 tracker 只在内存保存当前匹配段/比例，纯函数精确生成灰色已走与蓝色剩余 LineString；终点无剩余线，无效匹配不伪造已走部分，拓扑漂移时隐藏进度敏感交通层。索道/观光车只显示未完成段，暂停恢复保留最后确认匹配但清空偏航/到达/反向连续证据：`src/lib/formal-navigation-route-display.ts`、`src/components/FormalNavigationMap.tsx`、`src/components/FormalNavigationPlanner.tsx`、`tests/formal-navigation-route-display.test.mjs`、`tests/e2e/formal-auto-reroute.spec.ts`。缺正式长路线、多模式换乘、代表性真机渲染和现场理解，B、C、L 与场景 4、19、36、38 仍为 `PARTIAL` / `UNVERIFIED`。
- N17 修复实时定位强制抢回地图视野：可靠定位仅在 `FOLLOWING` 模式驱动相机，拖动/缩放/旋转进入 `BROWSING`，剩余路线总览只取未完成几何，后续 GPS 保持总览；显式回中才恢复跟随，低精度/停止状态不移动相机。模式有可见文字、读屏状态和不少于 44px 控件：`src/lib/formal-navigation-map-camera.ts`、`src/components/FormalNavigationMap.tsx`、`tests/formal-navigation-map-camera.test.mjs`、`tests/formal-navigation-map.test.mjs`、`tests/e2e/formal-auto-reroute.spec.ts`。缺代表性手机/浏览器手势、低端 GPU、前后台、强光/缩放/读屏及现场任务理解，C、L 与场景 4、19、36、38 仍为 `PARTIAL` / `UNVERIFIED`。
- N18 把正式导航的前后台边界从单一 `visibilitychange` 收口为纯页面生命周期状态机：`visibility/pagehide/freeze` 去重暂停并清除自动重算最近定位，异步开始/重算不得在后台激活；`pageshow/resume` 回前台后先重新核验完整正式快照，版本一致仍要求游客显式确认并等待新鲜定位。页面显示后台/复核中/待确认/停止状态：`src/lib/formal-navigation-page-lifecycle.ts`、`src/components/FormalNavigationPlanner.tsx`、`tests/formal-navigation-page-lifecycle.test.mjs`、`tests/e2e/formal-auto-reroute.spec.ts`。缺代表性真机锁屏、BFCache、系统回收、权限撤回、长时间后台、弱网和现场恢复任务，C、L 与场景 4、5、17、36、38 仍为 `PARTIAL` / `UNVERIFIED`。
- N19 为正式导航增加显式开启的前台关键语音：只从当前路线指纹、正式道路边、结构化 maneuver 与可靠定位生成；曲线造型点不会改变道路身份，同一指令只在更近距离分档且满足冷却时重播。全局静音、后台、暂停、定位退化、偏航、反向、到达与版本失效会取消旧语音或播报有界安全提示，语音状态与时序不持久化：`src/lib/formal-navigation-voice.ts`、`src/components/FormalNavigationPlanner.tsx`、`tests/formal-navigation-voice.test.mjs`、`tests/e2e/formal-navigation-voice.spec.ts`。浏览器语音只作为可关闭辅助，缺代表性真机、多浏览器声音策略、静音区、耳机/蓝牙/来电抢占、噪声和现场理解证据，场景 4、17、36–38 仍为 `PARTIAL` / `UNVERIFIED`。
- 公开地图仅显示“标准地图／禅意皮肤”；候选 GIS 不进入离线包。正式包需经发布 API、ECDSA/逐资产流式哈希和原子活动登记，Service Worker 只服务签名清单路径；离线样式缩减为无网络矢量子集，所有 source 强制指向同包 PMTiles，POI 限有界 WGS84 Point，路网/运营/地图资产同包同版本；没有当前正式包时明确停止：`src/lib/amap-modes.ts`、`src/lib/formal-offline-pack-client.ts`、`src/components/FormalNavigationMap.tsx`、`public/sw.js`。
