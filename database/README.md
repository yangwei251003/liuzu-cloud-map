# 数据库基础

当前迁移采用标准 PostgreSQL + PostGIS，不绑定 Neon、Supabase 或某一家国内云。数据库尚未接入公开预览；没有 `DATABASE_URL` 时，服务端持久化能力必须明确返回未启用，不能退化成进程内“伪持久化”。

地图社交生态的数据模型见 `migrations/004_social_ecosystem.sql`，正式 POI 与地点社区的一对一发布约束见 `migrations/009_formal_place_communities.sql`，账号级导航历史的 revision/幂等/无轨迹约束见 `migrations/010_navigation_session_lifecycle.sql`，GIS 候选提交与职责分离审核隔离区见 `migrations/011_gis_draft_review_workflow.sql`，正式道路紧急管制与独立复核见 `migrations/012_route_closure_control.sql`，替代运营快照见 `migrations/013_route_operational_snapshot_release.sql`，GIS 正式化与管理发布见 `migrations/014_gis_formalization_release.sql`，索道/观光车服务语义见 `migrations/015_scenic_transport_routing.sql`，短时客流/天气观测与快照绑定见 `migrations/016_route_operational_observations.sql`。迁移不会写入任何真实 UGC、地点社区、导航轨迹、道路、交通班次、天气或客流数据；第十六号迁移只建立观测、独立复核和不可变绑定约束，只有运行时获得真实授权、证据和独立发布动作后才可能影响正式快照。

## 前置条件

- PostgreSQL 15 或更高版本；
- 数据库角色具有创建 `postgis` 扩展的权限，或由数据库管理员预先启用 PostGIS；
- TLS 默认使用 `verify-full` 校验服务器证书与主机名；本地受控数据库如确需明文连接，显式设置 `DATABASE_SSL_MODE=disable`，不接受仅加密但跳过证书校验的 `require` 模式；
- 运行时最小权限账号只通过 `DATABASE_URL` 注入；迁移专用高权限账号只通过 `DATABASE_MIGRATION_URL` 注入。两个账号必须分离，均不得写入仓库、日志或客户端变量。

## 执行迁移

```powershell
npm run db:migrate
```

迁移器会按文件名顺序执行 `database/migrations/*.sql`，使用数据库 advisory lock 防止两个发布任务同时迁移，并把文件名与 SHA-256 校验值记录到 `schema_migrations`。已执行的历史迁移一旦发生变化会失败关闭，应新增下一号迁移，不得覆盖历史。若托管平台不允许 `CREATE EXTENSION postgis`，请让平台管理员先启用扩展后重试；不要删除空间字段或把未核验 GeoJSON 偷换成正式数据。

## 回滚与补偿

每一个正向迁移都有同名补偿脚本位于 `database/rollbacks/`。回滚是破坏性操作，脚本要求迁移专用连接、显式环境开关 `ALLOW_DATABASE_ROLLBACK=1` 和目标迁移号，例如：

```powershell
npm run db:rollback -- --to=2
```

它只会反向执行已应用且编号大于目标的连续迁移，并在同一事务和 advisory lock 内移除对应的 checksum 记录。运行前必须验证备份；运行后必须重放迁移、执行权限/租户隔离测试，并记录恢复演练。仓库未配置真实数据库时不得把静态脚本当作回滚演练证据。

## 一次性真库集成门

`npm run test:db` 只接受数据库名明确含 `test` 或 `ci`、除 PostGIS 自带 `spatial_ref_sys` 外没有公共表的一次性空库，并同时要求：

- `DATABASE_TEST_URL`
- `ALLOW_DATABASE_INTEGRATION_TESTS=1`
- `DATABASE_TEST_CONFIRM_DISPOSABLE=1`

验证器自动发现当前全部迁移与同名补偿脚本，不再写死早期迁移数量；它执行全量前进迁移、回滚至 0、再次全量迁移，然后使用纯虚构数据验证 N6–N12 并发幂等、GIS 与运营职责分离、不可变触发器、N9 在最终快照插入故障时整笔事务零残留，以及 N12 客流/天气观测的提交、独立复核、完整动态快照编译和原子发布。流程会留下已发布虚构数据，因此数据库必须用后即弃，严禁指向生产、共享开发或含业务数据的实例。

GitHub Actions 使用临时 `postgis/postgis` 服务运行同一命令；本机没有可用 PostgreSQL/Docker 时只能验证门禁代码，不能把未执行状态记录为真库通过。该门仍不替代备份/PITR、恢复、并发容量、生产最小权限或现场数据发布演练。

首个迁移只建立多景区租户根与服务端分享所需的最小表。第二号迁移新增游客账号、30 天会话、持久化登录/注册限流、身份审计和分享所有者外键。第三号迁移增加来源、发布版本、边界/入口/POI/设施/风险、路网/封路快照、行程/会话、同意/数据主体请求、内容/知识和运营审计的控制面表。它们都以 `scenic_area_id` 隔离。迁移不会自动导入当前候选 GIS 数据，也不会把任何路线提升为正式 `READY`。

## 游客账号开关

游客账号只有以下条件同时满足时才启用：

- `DATABASE_URL` 指向已执行全部迁移的运行时数据库；
- `VISITOR_AUTH_ENABLED=1`；
- `VISITOR_AUTH_RATE_LIMIT_PEPPER` 是独立生成且至少 32 字节的服务端秘密，只注入运行环境，不写入仓库、客户端变量或日志。

游客 handle 在单个景区租户内唯一，只接受 3–32 位小写字母、数字、下划线和连字符；输入会先去除首尾空格并转小写。口令至少 12 字符、至多 128 字符，经 Node.js 异步 `scrypt` 和每账号 16 字节随机盐派生后才写库，数据库不保存明文口令。会话使用 32 字节随机令牌，数据库只保存 SHA-256 摘要；浏览器只通过 `HttpOnly; SameSite=Lax; Path=/` Cookie 接收令牌，固定 30 天过期，生产环境增加 `Secure`。

接口：

- `POST /api/v1/auth/register`：严格 JSON `{ scenicAreaId, handle, passphrase }`；
- `POST /api/v1/auth/login`：相同严格结构；
- `POST /api/v1/auth/logout`：严格 JSON 空对象 `{}`；
- `GET /api/v1/auth/me`：读取当前游客会话。

所有写接口必须携带与请求 URL 完全同源的 `Origin`，所有身份响应均 `no-store` 并带最小安全头。登录与注册失败按“景区 + 操作 + 带 pepper 的 handle/network 摘要”写入数据库节流表；不保存原始 IP。连续失败达到阈值时锁定 15 分钟，接口使用通用错误，不通过错误正文区分账号是否存在。

这套游客身份只代表自助游客账号，不是运营实名、工作人员身份或 MFA。运营发布、内容审核和生产管理身份仍保持失败关闭，不能用游客 Cookie 冒充。

## 服务端分享开关

- `SERVER_SHARE_ENABLED=1`：允许读取、撤销已存在的服务端分享；
- 创建分享始终要求有效游客会话，`created_by_subject` 与所有者账号由服务端会话推导，不能从客户端请求体指定；
- 撤销始终要求同一景区内的分享所有者会话。创建时返回一次的撤销凭证可作为附加证明，但不能代替所有者会话；
- 公共读取 `/api/v1/shared-routes/{publicToken}` 不要求登录，仍遵守七天到期和撤销状态；
- 项目不再提供匿名服务端创建开关。

公开预览当前不配置这些变量，因此继续使用浏览器本机分享原型。数据库、功能开关或可信身份任一缺失时，接口都会失败关闭，不会使用内存数据冒充数据库。

## 账号级导航历史开关

- `NAVIGATION_HISTORY_ENABLED=1`：在游客账号与数据库能力均已启用时，开放私有导航会话创建、事件和历史读取；
- 创建请求只提交正式路线的封闭约束与路线指纹，服务端会重新计算当前路线并核对；不能提交坐标、路线几何或任意边权；
- 事件使用幂等键和 `expectedRevision`，只保存开始、暂停、恢复、重算、到达、退出及 50 米剩余距离档位；数据库注释与约束禁止把表扩展成 GPS/朝向/轨迹存储；
- `/account` 只向当前游客读取自己的记录；数据导出包含这些粗粒度会话，注销账号会通过外键级联删除；
- 任一能力缺失时，接口明确返回未启用，游客端逐向导航继续在浏览器内存运行并显示“未跨设备保存”。

## GIS 候选审核开关

- `ADMIN_GIS_WORKFLOW_ENABLED=1` 只打开能力门，不能单独授权任何写入；还必须有真数据库、至少 32 字节的 `ADMIN_IDENTITY_ASSERTION_SECRET`、受信任 OIDC 边缘、精确 issuer/audience、MFA 证据配置和数据库内有效租户角色；
- 可信边缘通过 `x-liuzu-admin-identity` 与 `x-liuzu-admin-signature` 注入最长 60 秒、绑定请求方法和路径的身份断言。浏览器 bearer、客户端角色和未签名代理头不是身份；
- `GIS_EDITOR` 可提交候选集合，`GIS_REVIEWER` 可在精确 revision 上审核，但同一 OIDC subject 不能自审；所有审核必须引用 HTTPS 证据；
- 审核员可通过同一路径的 `GET` 读取待审游标页，并通过 `/{submissionId}` 读取单个不可变详情；服务端会重建严格集合并复核对象数、租户和规范化摘要，页面不接收提交人原始 subject；
- N6 审核通过只产生 `APPROVED_FOR_FORMALIZATION`，审核 API 本身不能提升候选数据。正式路网/POI 只能进入 N9 的独立正式化流程，由第二位 GIS 人员生成不可变计划，再由独立发布管理员原子发布；真库、许可、现场和管理证据仍是发布前置条件。

## 正式道路运营开关

- `ROUTE_OPERATIONS_ENABLED=1` 只打开能力门；真数据库、可信边缘 HMAC 身份断言、精确 OIDC/MFA 配置和租户角色仍必须同时成立；
- `OPERATIONS_EMERGENCY` 只能对当前发布、现场核验快照中的 `OPEN` 边新增 `CLOSED/RESTRICTED` 事件，必须绑定 snapshot revision、HTTPS 来源/原因证据、最长七天有效期、幂等键和明确风险确认；
- 事件按开始时间立即使旧正式读取失败关闭。没有另行发布的新运营快照时，系统只停止旧路线，不自动生成或宣称存在安全绕行；
- 不同 subject 的 `RELEASE_ADMIN` 才能确认或撤回。撤回只移除这一事件作为阻断依据，不是道路开放证明；每个动作同时进入不可变动作表和管理员审计；
- 正式启用前仍需官方事件源、运营责任人、值班/复核 SLA、延长/替代路线发布流程、通知渠道、多人并发与现场演练。

## 替代运营快照开关

- `ROUTE_OPERATIONAL_RELEASE_ENABLED=1` 只打开 N8 能力门；仍必须有真数据库、可信边缘 HMAC 身份断言、精确 OIDC/MFA 配置和租户角色；
- `OPERATIONS_EMERGENCY` 只能从当前正式快照、全部已确认管制和每条边最新的已复核有效动态观测准备不可变候选。请求不接受路网、坐标、几何、边状态或任意权重；
- 有待复核事件或观测、没有任何已确认来源、基础快照/事件/观测集合漂移、全边映射不完整、摘要不符、候选过期或少于十分钟有效期时失败关闭；计划未来开始的确认事件从发布时起保守阻断；
- 不同 subject 的 `RELEASE_ADMIN` 重新核对候选后，单事务撤下旧快照、标记旧运营 version 为 `SUPERSEDED`、发布新运营 version 和 snapshot revision。绑定旧版本的离线包必须失效并重新审核签名；
- 第十三号补偿脚本会在存在已发布替代快照时拒绝自动回退，避免把已经被导航消费的版本链静默删除；必须按受控发布/恢复流程处理；
- 事件或替代快照到期不证明道路开放。真 PostGIS 迁移/补偿/并发/故障注入、官方事件源、真实多人、轮转 SLA、离线再签和现场演练仍是生产阻塞。

## 客流与天气观测开关

- `ROUTE_OPERATIONAL_OBSERVATIONS_ENABLED=1` 只打开 N12 能力门；真数据库、可信边缘身份断言、OIDC/MFA 与租户角色仍必须同时成立；
- `OPERATIONS_EDITOR` 只可对当前正式快照中的 `OPEN` 边提交最长六小时的客流等级、天气影响和 1–3 倍耗时，必须绑定 snapshot revision、观测时间、HTTPS 一手依据、说明、有效期和幂等键；倍率为 1 时只允许 `LOW + NONE`；
- 不同 subject 的 `OPERATIONS_REVIEWER` 才可确认或拒绝，且复核时正式 snapshot revision 与路网仍须一致；提交、复核动作和管理员审计不可更新/删除；
- 确认观测不会直接修改游客路线。只有 `ROUTE_OPERATIONAL_RELEASE_ENABLED=1` 的完整快照流程把精确观测 ID/哈希绑定到候选，再由独立 `RELEASE_ADMIN` 发布后才生效；发布前出现新观测、待复核观测或哈希漂移会停止；
- 当前没有任何六祖镇正式客流或天气观测。传感器责任、采样规范、现场交叉核验、过期轮转、异常值处理、多人值班和真机/现场验证完成前不得生产启用。

## GIS 正式化发布开关

- `GIS_FORMALIZATION_RELEASE_ENABLED=1` 只打开 N9 能力门；仍必须同时具备真数据库、可信边缘签名身份、精确 OIDC/MFA 和租户角色。
- 第二位 `GIS_REVIEWER` 只能为内容摘要仍一致的 `APPROVED_FOR_FORMALIZATION` 提交准备计划，并且不能是提交人或原专业审核人。每条路径必须显式选择 `PUBLIC/INTERNAL` 和方向；入口必须精确接入两层顶点，POI/设施必须精确位于内部顶点，不做静默吸附。
- 不同 `RELEASE_ADMIN` 发布前会重新读取候选、重算提交/计划摘要、重建并校验正式路网与全边运营状态。活动管制或待发布运营替代候选存在时，禁止用初始全开放新版本覆盖。
- 发布事务撤下旧快照、旧静态/运营版本和绑定旧快照的在线离线包，再写入新来源、publication、边界、入口、POI、设施、推荐线、节点、边、运营状态和快照。第十四号补偿脚本在已有正式发布结果时拒绝自动回退。
- 该开关不能替代官方 GIS/许可、现场双向复走、道路方向与开放确认、真实多人职责分离、离线撤回传播、管理签字或真 PostGIS 故障演练。

## 上线前仍未闭合

代码闭环不等于生产运行闭环。正式启用前仍需要：选择并配置 PostgreSQL/PostGIS、建立迁移/运行账号和备份恢复演练、配置秘密轮换与监控告警、确认隐私告知和账号恢复流程。运营人员实名、MFA、角色治理与应急停用不在游客账号能力内，仍是独立的生产阻塞项。
