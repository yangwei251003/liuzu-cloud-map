# GIS 数据模型与坐标规则

本文件描述仓库中已建立的**发布数据契约**，不是对任何候选 GIS、坐标转换、入口或路网真实性的声明。

## 不可变规则

- 权威几何的存储目标是 WGS84 / EPSG:4326；`geometry_wgs84`、原坐标系、转换方法和转换版本均由 `../database/migrations/003_p0_control_plane.sql` 要求记录。
- 高德或其他地图供应商的 GCJ-02 仅能作为获批显示层转换结果；没有转换来源、方法/版本和审核证据，不得写入发布快照。
- 每个发布依赖必须有来源、许可/使用权、采集日期、审核/核验人和有效期。迁移本身刻意不插入任何已发布 GIS 或内容数据。
- 发布快照需要边界、至少一个已核验入口、POI/别名、路网和有效运营状态；入口缺失必须失败关闭，禁止以 POI 中心替代入口。
- 候选 OSM、公开搜索、高德 POI 或 URI 导航不得成为内部路线折线、正式拓扑或发布证据。

## 版本化实体与代码边界

| 实体 | 存储/服务证据 | 不能据此推断的事实 |
| --- | --- | --- |
| 数据源与发布版本 | `data_sources`、`scenic_area_publications`、`scenic_published_snapshots` | 尚无官方来源、许可或发布权。 |
| 边界、入口、POI、别名、设施、开放规则、风险区 | `published_boundaries`、`published_entrances`、`published_pois`、`published_opening_rules`、`published_risk_zones` | 尚无现场核验或有效期内的景区数据。 |
| 路网与封路 | `route_network_revisions`、`route_nodes`、`route_edges`、`route_operational_versions`、`closure_events` | 尚无可供游客使用的官方内部路网或封路 SLA。 |
| 导航策略与历史 | `../database/migrations/005_scenic_navigation_intelligence.sql`、`../database/migrations/010_navigation_session_lifecycle.sql`、`../src/lib/directed-route-engine.ts`、`../src/lib/server/navigation-session-service.ts` | 道路类型、难度、观光评分、拥堵和天气影响必须由正式快照提供；历史只证明路线版本与粗粒度生命周期，不证明游客轨迹或现场安全。 |
| GIS 候选提交与审核 | `../database/migrations/011_gis_draft_review_workflow.sql`、`../src/lib/server/gis-draft-submission-service.ts`、`../src/lib/server/gis-draft-submission-repository.ts` | 不可变提交、内容哈希或 GIS 审核通过都不等于正式 publication、管理方批准、现场核验或游客可用路网。 |
| 正式道路紧急管制 | `../database/migrations/012_route_closure_control.sql`、`../src/lib/server/route-operations-service.ts`、`../src/lib/server/route-operations-repository.ts` | 事件只能阻断当前正式边；确认不生成替代路线，撤回不证明道路物理开放，代码也不能替代官方事件源、值班 SLA 或现场复核。 |
| 替代运营快照 | `../database/migrations/013_route_operational_snapshot_release.sql`、`../src/lib/route-operational-release-compiler.ts`、`../src/lib/server/route-operational-release-repository.ts` | 新快照只复制当前已发布静态路网并重建完整运营状态；候选/摘要/原子替换不能证明事件来源真实、道路可绕行、到期后已开放或现场已验收。 |
| 客流/天气动态观测 | `../database/migrations/016_route_operational_observations.sql`、`../src/lib/server/route-operational-observation-repository.ts`、`../src/components/RouteOperationalObservationWorkbench.tsx` | 六小时内观测、职责分离和哈希绑定只能证明软件工作流；不能证明传感器准确、采样代表性、天气/客流真实、责任源持续在线或现场安全。当前没有六祖镇正式观测数据。 |
| GIS 正式化与发布 | `../database/migrations/014_gis_formalization_release.sql`、`../src/lib/gis-formalization-compiler.ts`、`../src/lib/server/gis-formalization-repository.ts` | 精确顶点、摘要、职责分离和原子写入只能证明软件控制存在；不能证明候选是官方 GIS、许可真实、方向/开放状态已现场确认或管理方已签字。 |
| 索道/观光车交通段 | `../database/migrations/015_scenic_transport_routing.sql`、`../src/lib/directed-route-engine.ts`、`../src/lib/formal-navigation-runtime.ts` | 服务字段与显式选择不能证明班次、票价、排队、上下客点、无障碍或当日开放状态真实。当前没有六祖镇正式交通线路数据。 |
| 发布读取/路线 API | `../src/app/api/v1/scenic-areas/[id]/snapshot/route.ts`、`../src/app/api/v1/route-plans/route.ts` | API 存在不等于数据库、GIS 数据或现场安全已经通过。 |

## 路由约束

`../src/lib/directed-route-engine.ts` 只允许方向正确、连续、未关闭、未过期且资料足够的有向边；无障碍请求还排除台阶、未知/不合格可达性与不合格坡度/宽度。`../src/lib/server/formal-routing-service.ts` 在没有完整、当前、已发布快照时拒绝提供正式路线。`../src/lib/route-operation-monitor.ts` 规定 15 秒、网络恢复和页面恢复时重查版本，并在版本变化、过期或无安全替代路线时暂停旧指令并转人工求助。

路线策略现支持 `FASTEST`、`SHORTEST`、`SCENIC`。revision 内所有边都必须带完整 `routing` 属性；否则返回 `ROUTING_ATTRIBUTES_UNAVAILABLE`。索道/观光车默认禁用，只有游客显式选择且边携带服务名称、上车/等候/乘坐时间和 HTTPS 班次依据时才能进入规划；其基础时间是三段时间之和，缺字段返回 `TRANSPORT_SERVICE_UNAVAILABLE`。动态预计时间只使用运营快照中的 `travelTimeMultiplier`，客户端不能提交任意边权。年龄只用于建议由游客确认的节奏/难度，不作为核心算法的隐式判断。

N8/N12 的替代快照不修改 `route_network_revisions`、`route_nodes` 或 `route_edges`。服务器从当前正式 `snapshot_json` 取静态路网，从确认管制与每条边最新的独立复核观测生成新的 `route_operational_versions` 和完整 `route_edge_operational_states`，逐边覆盖且与规范化 edge code 精确对应。准备候选保存精确事件/观测集合及 SHA-256；发布事务撤下旧 `scenic_published_snapshots` 并插入新 revision。任何待复核项、集合漂移、摘要不符或状态缺边都失败关闭。路线 traversal 携带已发布的倍率、客流和天气供游客侧披露；客户端仍不能提交任意边权。

上述约束有相应的源码级测试入口（例如 `../tests/directed-route-engine.test.mjs`、`../tests/route-operation-monitor.test.mjs`）；当前自动化取证版本与数字统一以 [RELEASE_READINESS_AUDIT.md](RELEASE_READINESS_AUDIT.md) 为准。**真 PostGIS、地图坐标控制点、现场双向复走和签字仍待完成**，因此 GIS 与路线总体状态为 `PARTIAL` / `UNVERIFIED`，不是 `PASS`。

## 发布数据最小门

在项目方完成官方 GIS、许可、现场核验、封路责任和审批前，系统必须保持“无正式内部导航”。任何未知、过期、撤回、拓扑不连续或缺入口情况都应返回不可用，而不是展示候选线作为安全引导。
