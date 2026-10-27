# GIS 与 AI 官方来源

状态：`CURRENT_AS_OF_2026-08-14`  
访问基准日：2026-08-14（Asia/Shanghai）  
用途：支撑 Discovery 阶段《GIS 地图技术调研》与《AI 导游 Agent 方案研究》。本账本只登记法规/标准原文、政府页面、标准组织文档、供应商官方文档/协议和官方 API 研究快照，不以搜索摘要、媒体或旅游平台证明事实。

## 来源等级

- **A1**：国家法律法规、主管部门正式文件、国家/行业标准原文；用于规范性事实。具体适用性仍需法务/景区主管部门确认。
- **A2**：标准组织、操作系统/平台或供应商的官方技术文档、价格页、协议和隐私说明；用于证明官方能力、限制和当期条款，不证明六祖镇现场质量。
- **A3**：通过官方 API 获得且已去除密钥的时间点快照；用于候选核验，不等同于现场事实、永久事实或可发布资产。

所有动态产品能力、价格、配额、隐私政策与合同条款至少在 **Gate 2 前、签约前、上线前**复核；法规/标准在设计评审和上线前复核生效状态。

## 一、法规与监管文件

| ID | 标题 | 机构 | URL | 发布/更新/生效 | 访问日 | 等级 | 关键结论 | 时效复核点 |
|---|---|---|---|---|---|---|---|---|
| REG-01 | 《地图管理条例》 | 国务院 / 中国政府网 | [原文](https://www.gov.cn/zhengce/zhengceku/2015-12/14/content_10403.htm)；[外交部 PDF 备份](https://www.mfa.gov.cn/web/wjb_673085/zzjg_673183/bjhysws_674671/bhflfg/dtdmxgfl/202303/P020230313586382250479.pdf)；[国家行政法规库](https://xzfg.moj.gov.cn/front/law/detail?LawID=421&Query=) | 2015-11-26 公布，2016-01-01 施行 | 2026-08-14 | A1 | 互联网地图服务、地图审核/审图号、持证主体、境内服务器、位置个人信息和新增内容审核均有明确制度要求。项目适用角色须法务确认。 | Gate 2 核对现行版本；签约时让地图供应商书面说明资质、审图、服务器与自有覆盖层责任。 |
| REG-02 | 《中华人民共和国个人信息保护法》 | 全国人大常委会；国家统计局官方转载 | [原文](https://www.stats.gov.cn/gk/tjfg/xgfxfg/202503/t20250310_1958923.html) | 2021-08-20 通过，2021-11-01 施行；转载页 2025-03-10 | 2026-08-14 | A1 | 行踪轨迹属于敏感个人信息；处理敏感信息需特定目的、充分必要、严格措施和单独同意，并涉及告知、最短保存、影响评估、提供/跨境等规则。 | 隐私设计评审、供应商 DPA、上线前 PIPIA；规则修订时立即复核。 |
| REG-03 | 《网络数据安全管理条例》 | 国务院 / 中国政府网 | [原文](https://app.www.gov.cn/govdata/gov/202409/30/520076/article.html) | 2024-09-30 公布，2025-01-01 施行 | 2026-08-14 | A1 | 要求清晰个人信息处理规则、最小必要、权利响应、删除/匿名化、审计与跨境条件；敏感轨迹处理需关注单独同意。 | 数据流图、日志/留存、跨境路径和上线合规评审时复核。 |
| REG-04 | 《生成式人工智能服务管理暂行办法》 | 国家互联网信息办公室等七部门 | [原文](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm) | 2023-07-10 公布，2023-08-15 施行 | 2026-08-14 | A1 | 面向境内公众的生成式 AI 服务涉及内容、数据来源、知识产权、个人信息、准确可靠、投诉处置及相关安全/备案责任。上下游角色和具体义务需法务确认。 | 模型/部署形态确定后及上线前复核备案、安全评估与服务角色。 |
| REG-05 | 《人工智能生成合成内容标识办法》 | 国家互联网信息办公室、工业和信息化部、公安部、国家广播电视总局 | [原文](https://www.cac.gov.cn/2025-03/14/c_1743654685899683.htm) | 2025-03 发布，2025-09-01 施行（现行） | 2026-08-14 | A1 | 对生成合成文本、音频、图片、视频等提出显式和隐式标识要求；动态回答、合成讲解与导出分享都须纳入标识设计。 | UI/资产/导出协议设计与上线前按现行配套标准复核。 |
| REG-06 | 《人工智能拟人化互动服务管理暂行办法》 | 国家互联网信息办公室等 | [原文](https://www.cac.gov.cn/2026-04/10/c_1777558395078289.htm) | 2026-04-10 发布，2026-07-15 施行（现行） | 2026-08-14 | A1 | 第二条纳入模拟人格并持续情感互动的服务，同时排除不具备持续情感互动的智能客服、知识问答、工作助手、学习研究应用。“禅小荔”是否排除须按实际人格/记忆/互动做法务判断。 | 人格、长期记忆、主动消息、情感机制或未成年人模式每次变化都复核；上线前出书面意见。 |

## 二、旅游行业标准

| ID | 标题 | 机构 | URL | 发布/更新/生效 | 访问日 | 等级 | 关键结论 | 时效复核点 |
|---|---|---|---|---|---|---|---|---|
| STD-01 | GB/T 17775-2024《旅游景区质量等级的划分》 | 国家市场监督管理总局、国家标准化管理委员会 | [国家标准信息页](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=2FA5FF63790692575C2357E99D4E88EF) | 2024-08-23 发布，2025-03-01 实施；**现行** | 2026-08-14 | A1 | 旅游景区质量等级的现行国家标准，作为服务、导向、安全和质量体系基线之一。 | 景区等级/验收目标确定后由景区主管方确认具体条款。 |
| STD-02 | LB/T 093-2025《旅游景区在线信息要求》 | 文化和旅游部 | [公告页](https://zwgk.mct.gov.cn/zfxxgkml/hybz/202505/t20250520_960056.html)；[标准 PDF](https://zwgk.mct.gov.cn/zfxxgkml/hybz/202505/W020250520321107535210.pdf) | 2025-08-19 实施；**现行** | 2026-08-14 | A1 | 在线信息覆盖电子地图、交通、开放/时段、设施、路线、讲解、安全/救援等；强调真实准确、更新、合法来源、最小必要、去标识和权限控制。 | 信息架构、运营后台、内容 SLA 与上线验收时逐条映射。 |
| STD-03 | LB/T 097-2025《智慧旅游 沉浸式体验空间要求与评价》 | 文化和旅游部 | [公告页](https://zwgk.mct.gov.cn/zfxxgkml/hybz/202510/t20251020_962849.html)；[标准 PDF](https://zwgk.mct.gov.cn/zfxxgkml/hybz/202510/W020251118528025951512.pdf) | 2025-10-17 发布并实施；**现行** | 2026-08-14 | A1 | 适用于实体沉浸式体验空间；强调文化/IP、技术适用与稳定、不同人群、动线、安全、试运行、网络和隐私。不能据此推导 MVP 必须增加 AR/VR。 | 仅在项目决定建设实体沉浸空间时全面适用和验收。 |
| STD-04 | LB/T 014-2026《旅游景区讲解服务规则》 | 文化和旅游部 | [发布公告](https://zwgk.mct.gov.cn/zfxxgkml/hybz/202607/t20260708_966460.html)；[标准页](https://zwgk.mct.gov.cn/zfxxgkml/hybz/202607/t20260708_966464.html)；[标准 PDF](https://zwgk.mct.gov.cn/zfxxgkml/hybz/202607/W020260708571069827374.pdf) | 2026-07 发布；2026-10-02 实施；**已发布、待生效** | 2026-08-14 | A1 | 前瞻要求包括准确、客观、安全、定期更新，按点/线路/时长组织录音，清晰规范表达，以及智能讲解、定位导航、评价改进等。当前不得写成现行。 | 2026-10-02 后或产品上线前重新确认生效/替代状态并按届时文本验收。 |

## 三、高德地图官方来源

| ID | 标题 | 机构 | URL | 发布/更新 | 访问日 | 等级 | 关键结论 | 时效复核点 |
|---|---|---|---|---|---|---|---|---|
| AMAP-01 | JavaScript API / JavaScript API 2.0 概述 | 高德开放平台 | [概述](https://lbs.amap.com/api/JavaScript-api/summary)；[2.0 概述](https://lbs.amap.com/api/javascript-api-v2/summary) | 页面分别更新 2025-12-24、2025-01-16 | 2026-08-14 | A2 | Web 端支持底图、定制、覆盖层、POI、路线、定位、坐标转换；文档列有 WMS/WMTS/自有数据等能力。具体版本、商用与六祖镇质量待 PoC。 | Gate 2 核验目标版本、浏览器兼容、配额与迁移公告。 |
| AMAP-02 | 步行路线规划示例 | 高德开放平台 | [官方示例](https://lbs.amap.com/demo/javascript-api-v2/example/walking-route/walk-custom) | 页面未标示；访问日快照 | 2026-08-14 | A2 | JS API 可计算和展示步行路线；只证明通用能力，不证明景区内部道路可通行。 | 六祖镇同点集 PoC、版本更新和上线前复核。 |
| AMAP-03 | 路径规划 2.0 Web Service | 高德开放平台 | [官方文档](https://lbs.amap.com/api/webservice/guide/api/newroute) | 页面未标示；访问日快照 | 2026-08-14 | A2 | 步行等路径接口明确；官方建议条件允许时用 POI ID 表达端点以提升准确性。返回路线仍需入口与现场验证。 | API 版本/额度/字段变化及正式线路抽查。 |
| AMAP-04 | 高德开放平台服务协议 | 高德开放平台 | [协议](https://lbs.amap.com/pages/terms/) | 更新 2025-12-03 | 2026-08-14 | A2 | 对仅用官方功能、商用授权、标识保留、缓存/存储/抓取/衍生/再分发等设有约束。额外权利需书面合同。 | 签约前逐产品审阅；样式、截图、离线、自有层、多租户、数据导出逐项书面确认。 |
| AMAP-05 | 高德 Web 服务 API 使用条款与商业授权 | 高德开放平台 | [专项条款](https://lbs.amap.com/pages/law-web-service/summary)；[商业授权](https://lbs.amap.com/pages/authorization/) | 访问日快照 | 2026-08-14 | A2 | Web Service 与其他地图服务的组合有专项限制；商业授权按产品/场景确认，公开页不足以形成总成本。 | Gate 2 询价及法务解释组合、白标、缓存、日志和自有数据权利。 |
| AMAP-06 | 移动 SDK 离线地图 | 高德开放平台 | [Android](https://lbs.amap.com/api/android-sdk/guide/create-map/offline-map/?type=spa)；[iOS](https://lbs.amap.com/api/maps-sdk-for-ios/guide/create-map/use-offlinemap) | Android 更新 2025-05-12；iOS 更新 2026-07-02 | 2026-08-14 | A2 | 移动地图 SDK 有离线城市包能力；不能外推为 H5 可离线或可任意再分发。 | 决定原生端后核验包范围、大小、更新、授权和计费。 |
| AMAP-07 | Android 地图 SDK 概述及自定义地图 | 高德开放平台 | [SDK 概述](https://lbs.amap.com/api/android-sdk/summary)；[自定义地图](https://lbs.amap.com/api/android-sdk/guide/create-map/custom) | 概述更新 2025-12-03 | 2026-08-14 | A2 | 移动端支持地图显示、覆盖层、POI、地理编码、自定义和离线等；隐私合规初始化需按官方要求。 | 仅在原生端进入候选后做版本/隐私实机验证。 |
| AMAP-08 | POI 搜索 2.0 与 URI 路径规划 | 高德开放平台 | [POI 搜索 2.0](https://lbs.amap.com/api/webservice/guide/api/newpoisearch)；[URI 路径规划](https://lbs.amap.com/api/uri-api/guide/travel/route) | POI 文档更新 2023-12-26；URI 文档更新 2025-03-03 | 2026-08-15 | A2 | POI 搜索可返回地点、导航位置、入口/出口字段；URI 可用 `to` 和 `mode` 将步行/驾车交给高德，移动端起点为空时可尝试当前位置。前者是平台动态数据，后者不证明景区内部路线安全。 | 上线前复核版本、配额、URI 终端兼容和高德条款；内部路线另走发布审批。 |
| AMAP-DATA-01 | 高德 Place Text API 六祖镇核心 POI 候选快照 | 高德开放平台 API；项目内部采集记录 | [本地研究快照](../data/高德POI候选-2026-08-14.md) | 请求日 2026-08-14 | 2026-08-14 | A3 | 返回 GCJ-02 候选：国恩寺/故居/藏佛坑/禅域/温泉/度假区；藏佛坑双候选、镇名字段不一；惠能广场因 `CUQPS_HAS_EXCEEDED_THE_LIMIT` 无结果。未记录 key。 | 不高频重试；第二地图、景区和现场核验后才能发布/导航；API 许可与保存期限在选型时复核。 |
| AMAP-DATA-02 | 国恩寺公开 POI 入口与导航验证 | 高德开放平台 API；项目内部受控查询 | [本地验证记录](../data/高德公开入口与导航验证-2026-08-15.md) | 请求日 2026-08-15 | 2026-08-15 | A3 | 当次查询返回国恩寺、停车场和六祖殿的 GCJ-02 入口字段；游客端据此生成高德 URI，未把结果升级为官方内部路网或开放状态。未记录 key。 | 每次上线前、入口调整、版本/条款/配额变化后复核；景区内部动线仍需管理方发布。 |

## 四、百度地图官方来源

| ID | 标题 | 机构 | URL | 发布/更新 | 访问日 | 等级 | 关键结论 | 时效复核点 |
|---|---|---|---|---|---|---|---|---|
| BAIDU-01 | JavaScript API GL 概述 / 自定义地图 | 百度地图开放平台 | [概述](https://lbsyun.baidu.com/docs/jsapi?title=jspopularGL%2Findex)；[自定义地图](https://lbsyun.baidu.com/docs/jsapi?title=jspopularGL%2Fguide%2Fcustom) | 页面更新至 2026-07；官方提示 GL 为旧版、新项目使用 JSAPI 4.0 | 2026-08-14 | A2 | 旧版资料证明显示、搜索、路线、覆盖物和样式能力，但新项目必须在 4.0 实际环境和商务文档中复核，不可据旧版锁定。 | Gate 2 获取 4.0 完整文档、迁移政策并 PoC。 |
| BAIDU-02 | 坐标体系介绍 | 百度地图开放平台 | [官方文档](https://lbsyun.baidu.com/index.php?title=jspopular%2Fguide%2Fintroduction) | 访问日快照 | 2026-08-14 | A2 | 区分 WGS84、GCJ-02 和百度 BD-09；百度服务输出/显示坐标需明确声明和转换。 | 目标 API 版本和转换服务更新时复核，建立控制点测试。 |
| BAIDU-03 | 步行路线规划 Web Service / JS | 百度地图开放平台 | [Web Service](https://lbsyun.baidu.com/docs/webapi?title=directionv2%2Fwebservice-direction%2Fwalking)；[JS 指南](https://lbsyun.baidu.com/docs/jsapi?title=jspopularGL%2Fguide%2Frouteplan) | Web 文档更新 2026-03-19 | 2026-08-14 | A2 | 步行接口接受 BD-09/GCJ-02/WGS84 等输入声明，默认 BD-09；返回道路可能无名。内部步道仍须实测。 | 同点集 PoC、接口版本和调用计费复核。 |
| BAIDU-04 | Web 端定位 | 百度地图开放平台 | [官方指南](https://lbsyun.baidu.com/docs/jsapi?title=jspopularGL%2Fguide%2Fgeoloaction) | 访问日快照 | 2026-08-14 | A2 | 定位来源可能是浏览器、Android 辅助或 IP；IP 仅能给出粗粒度城市级结果，精度不保证。 | 实机/权限/浏览器矩阵验证，不以文档代替现场精度。 |
| BAIDU-05 | 第三方图层与自定义覆盖物 | 百度地图开放平台 | [第三方图层](https://lbsyun.baidu.com/docs/jsapi?title=jspopularGL%2Fguide%2FtrilateralLayer)；[自定义覆盖物](https://lbsyun.baidu.com/docs/jsapi?title=jspopularGL%2Fguide%2FCustomOverlay) | 访问日快照；GL 文档为旧版 | 2026-08-14 | A2 | 旧版文档支持 WMS/WMTS/TMS、自定义栅格和覆盖物；4.0 兼容及商用权利待确认。 | Gate 2 用 4.0 验证样式、性能、坐标与协议。 |
| BAIDU-06 | 百度地图开放平台服务协议 | 百度地图开放平台 | [协议](https://lbsyun.baidu.com/docs/pcsa?title=law%2Fopen%2Flaw) | 页面更新 2026-07-08；协议版本标注 2024-11-04 | 2026-08-14 | A2 | 对官方功能、缓存/存储/截图/下载/镜像/衍生/再分发、商用授权、版权/审图标识有约束，并提示地图信息可能与现实不同。 | 签约与上线前逐产品复核；获取离线、自有层、导出和多租户书面权利。 |
| BAIDU-07 | 商业授权 FAQ | 百度地图开放平台 | [官方 FAQ](https://lbsyun.baidu.com/index.php?title=FAQ%2Fauthorization) | 访问日快照 | 2026-08-14 | A2 | 页面提供企业商业授权价格线索；价格、包含产品和税费具有时效性，不能直接写入长期预算。 | Gate 2 重新询价并以正式报价/合同为准。 |

## 五、Mapbox 官方来源

| ID | 标题 | 机构 | URL | 发布/更新 | 访问日 | 等级 | 关键结论 | 时效复核点 |
|---|---|---|---|---|---|---|---|---|
| MAPBOX-01 | Directions API | Mapbox | [官方文档](https://docs.mapbox.com/api/navigation/directions/) | 访问日快照 | 2026-08-14 | A2 | 提供 walking profile、路线/转向、请求限制与计费单位；不证明六祖镇或中国境内步行覆盖质量。 | 同点集 PoC、网络可用性、端点精度、额度和服务地域复核。 |
| MAPBOX-02 | Geocoding API | Mapbox | [官方文档](https://docs.mapbox.com/api/search/geocoding/) | 访问日快照 | 2026-08-14 | A2 | 输入输出以 WGS84 为主；文档提供 `worldview=cn`，同时声明结果并非相关政府的官方批准，须做中国地图合规专项评估。 | 签约前取得中国数据、审图、服务主体和覆盖书面证明。 |
| MAPBOX-03 | Uploads / 坐标要求 | Mapbox | [官方文档](https://docs.mapbox.com/help/troubleshooting/uploads/) | 访问日快照 | 2026-08-14 | A2 | 自有数据上传通常要求 WGS84；与 GCJ-02/BD-09 图层叠加需可追溯合规转换。 | 数据方案评审时做控制点、转换与许可验证。 |
| MAPBOX-04 | Maps SDK for Android Offline | Mapbox | [官方文档](https://docs.mapbox.com/android/maps/guides/offline/) | 访问日快照 | 2026-08-14 | A2 | 移动 SDK 支持下载离线区域/缩放范围；该能力不等于任意缓存或再分发，且中国合规独立存在。 | 原生候选、离线范围、计费和条款确定时复核。 |
| MAPBOX-05 | Sub-processors / Privacy & Security FAQ | Mapbox | [官方法律页](https://www.mapbox.com/legal/subprocessors) | 子处理者页更新 2026-06-04；FAQ 标示 2023-08-22 | 2026-08-14 | A2 | 官方称后端主要托管 AWS 美国，并通过多地区 CDN；不能限定单一处理地域；请求可包含 IP、位置等字段。对中国轨迹传输构成 PIPL 跨境/DPA 评估点。 | 签约前核验最新 DPA、产品遥测开关、数据字段、删除、处理地及中国跨境路径。 |
| MAPBOX-06 | Mapbox Pricing | Mapbox | [官方价格页](https://www.mapbox.com/pricing) | 动态页面；访问日快照 | 2026-08-14 | A2 | 地图、方向、导航、MAU、行程、离线瓦片等按不同维度计费并有阶梯；不将当前单价固化到预算。 | Gate 2、签约和上线前按容量表重新计算。 |

## 六、OpenStreetMap 官方来源

| ID | 标题 | 机构 | URL | 发布/更新 | 访问日 | 等级 | 关键结论 | 时效复核点 |
|---|---|---|---|---|---|---|---|---|
| OSM-01 | Copyright and License | OpenStreetMap Foundation / OpenStreetMap Contributors | [官方版权页](https://www.openstreetmap.org/copyright) | 访问日快照 | 2026-08-14 | A2 | OSM 数据采用 ODbL，要求署名，并可能对衍生数据库触发共享要求；开放许可不替代中国地图合规。 | 数据组合、修改、发布、离线和多租户方案由法务按 ODbL 审核。 |
| OSM-02 | Tile Usage Policy | OpenStreetMap Foundation Operations Working Group | [官方政策](https://operations.osmfoundation.org/policies/tiles/) | 访问日快照 | 2026-08-14 | A2 | 公共栅格瓦片无 SLA，要求署名和遵循缓存头，禁止批量/离线预取；生产/离线应自建或采购提供商。 | 上线前确认没有直接依赖公共瓦片，政策变化时复核。 |
| OSM-03 | Vector Tile Usage Policy | OpenStreetMap Foundation Operations Working Group | [官方政策](https://operations.osmfoundation.org/policies/vector/) | 访问日快照 | 2026-08-14 | A2 | 公共矢量瓦片同样是有限、无 SLA 的共享资源，并有缓存/批量限制。 | 生产架构与缓存策略评审时复核。 |
| OSM-04 | Nominatim Usage Policy | OpenStreetMap Foundation Operations Working Group | [官方政策](https://operations.osmfoundation.org/policies/nominatim/) | 访问日快照 | 2026-08-14 | A2 | 公共 Nominatim 约 1 req/s，禁止自动补全和系统性 POI 查询等重用；生产应自建或采购。 | POI/地理编码方案确定时复核服务 SLA 与许可。 |

## 七、H5、小程序与原生端官方来源

| ID | 标题 | 机构 | URL | 发布/更新 | 访问日 | 等级 | 关键结论 | 时效复核点 |
|---|---|---|---|---|---|---|---|---|
| RUNTIME-01 | Geolocation | W3C | [Candidate Recommendation](https://www.w3.org/TR/geolocation/) | 2026-03-26 Candidate Recommendation Snapshot | 2026-08-14 | A2 | 需要明确权限，坐标按 WGS84；位置精度不保证。隐藏/非活跃文档不持续交付位置更新，因此 H5 不能承诺后台持续导航。 | 目标浏览器矩阵和规范更新时复核。 |
| RUNTIME-02 | Autoplay policy in Chrome | Google Chrome Developers | [官方说明](https://developer.chrome.com/blog/autoplay/) | 页面动态更新 | 2026-08-14 | A2 | 有声自动播放通常需要用户交互或满足浏览器策略；位置到点不等于可自动播放语音。 | Chrome/iOS Safari/微信内置浏览器实机测试；策略更新复核。 |
| RUNTIME-03 | `wx.startLocationUpdateBackground` | 微信开放文档 | [官方文档](https://developers.weixin.qq.com/miniprogram/dev/api/location/wx.startLocationUpdateBackground.html) | 页面未标示；访问日快照 | 2026-08-14 | A2 | 基础库 2.8.0 起可前后台接收定位；需后台位置权限、配置声明、类目/用途审核，插件不支持；旅游相关用途需以实际审核为准。 | 提审前核验最新类目、自助权限、隐私清单和真机表现。 |
| RUNTIME-04 | `wx.startLocationUpdate` | 微信开放文档 | [官方文档](https://developers.weixin.qq.com/miniprogram/dev/api/location/wx.startLocationUpdate.html) | 页面未标示；访问日快照 | 2026-08-14 | A2 | 可在前台持续接收位置，需用户位置权限和类目审核，可指定 WGS84/GCJ-02。 | 提审前复核权限和基础库；设备矩阵实测。 |
| RUNTIME-05 | `wx.getBackgroundAudioManager` | 微信开放文档 | [官方文档](https://developers.weixin.qq.com/miniprogram/dev/api/media/background-audio/wx.getBackgroundAudioManager.html) | 页面未标示；访问日快照 | 2026-08-14 | A2 | 已播放音频可在符合配置/审核时后台延续，但后台不能任意控制播放；不能据此承诺后台新触发讲解。 | 提审与真机切后台、锁屏、中断测试。 |
| RUNTIME-06 | `wx.getRecorderManager` | 微信开放文档 | [官方文档](https://developers.weixin.qq.com/miniprogram/dev/api/media/recorder/wx.getRecorderManager.html) | 页面未标示；访问日快照 | 2026-08-14 | A2 | 小程序提供录音管理 API；不证明后台持续 ASR 可行，首期适合单次/按住说话验证。 | 权限、时长、格式、噪声和后台行为真机复核。 |
| RUNTIME-07 | Handling location updates in the background / `allowsBackgroundLocationUpdates` | Apple Developer | [后台位置指南](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background)；[属性文档](https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates) | 动态文档；访问日快照 | 2026-08-14 | A2 | iOS 后台位置需能力声明、授权和正确会话配置，系统仍可能暂停/终止并影响指示/审核。 | 选原生 iOS 后按目标版本、商店规则和电量实测。 |
| RUNTIME-08 | Request background location / Background location limits | Android Developers | [权限](https://developer.android.com/develop/sensors-and-location/location/permissions/background)；[后台限制](https://developer.android.com/develop/sensors-and-location/location/background?hl=en) | 动态文档；访问日快照 | 2026-08-14 | A2 | Android 11+ 后台位置需设置页授权；后台位置只应服务核心功能，Android 8+ 对后台更新频率有限制，拒绝后台权限仍应可用降级功能。 | 目标 Android 版本、商店政策和厂商 ROM 实测。 |
| RUNTIME-09 | Optimize location for battery | Android Developers | [官方指南](https://developer.android.com/develop/sensors-and-location/location/battery) | 动态文档；访问日快照 | 2026-08-14 | A2 | 高精度和高频更新增加耗电；地理围栏等机制存在响应延迟，需按体验与电量折中。 | 景区真实游览时长、机型和定位策略 PoC。 |

## 八、AI、RAG、工具、语音与评测官方来源

| ID | 标题 | 机构 | URL | 发布/更新 | 访问日 | 等级 | 关键结论 | 时效复核点 |
|---|---|---|---|---|---|---|---|---|
| AI-01 | Structured outputs | Google AI for Developers | [官方文档](https://ai.google.dev/gemini-api/docs/structured-output) | 动态文档；访问日快照 | 2026-08-14 | A2 | JSON Schema 可约束输出形状，但官方明确提示仍需验证业务值和语义正确性；适合游记抽取而非免校验事实生成。 | 模型候选/SDK 版本变更和上线前回归。 |
| AI-02 | Function calling | Google AI for Developers | [官方文档](https://ai.google.dev/gemini-api/docs/function-calling) | 动态文档；访问日快照 | 2026-08-14 | A2 | 模型提出工具/参数，应用负责执行、鉴权、校验和错误处理；活跃工具应精简。支持首期单编排 + 只读白名单。 | 模型/SDK 变化、工具权限和安全评审时复核。 |
| AI-03 | Context caching | Google AI for Developers | [官方文档](https://ai.google.dev/gemini-api/docs/caching) | 页面更新 2026-08-13 | 2026-08-14 | A2 | 稳定重复上下文可缓存以降成本；缓存生命周期、删除、隐私和模型兼容需同时验证。 | Gate 2 按候选模型和隐私要求复核。 |
| AI-04 | Gemini API Pricing | Google AI for Developers | [官方价格页](https://ai.google.dev/gemini-api/docs/pricing) | 动态页面；访问日快照 | 2026-08-14 | A2 | 模型输入/输出、缓存、批量等计费维度会变化；只用于当期容量测算，不固化单价。 | Gate 2、签约和上线前重新计算。 |
| AI-05 | File Search | Google AI for Developers | [官方文档](https://ai.google.dev/gemini-api/docs/file-search)；[API 资源](https://ai.google.dev/api/file-search/file-search-stores?hl=en) | 动态文档；访问日快照 | 2026-08-14 | A2 | 托管 RAG 可导入/分块/索引、元数据过滤并返回引用；索引持久至手动删除，原始 File 生命周期不同，工具组合/容量/计费有限制。只是候选，不代替知识治理。 | Gate 2 核验地区、删除、DPA、引用质量、模型支持与费用。 |
| AI-06 | Text-to-speech generation | Google AI for Developers | [官方文档](https://ai.google.dev/gemini-api/docs/speech-generation) | 动态文档；访问日快照；部分能力标注 Preview | 2026-08-14 | A2 | 可将文本生成单/多说话人音频并控制风格；预览状态、专名准确、许可、地域和稳定性须 PoC，不能直接作生产承诺。 | 目标模型转 GA、声音条款、语言/专名测试和上线前复核。 |
| AI-07 | Speech-to-Text Data Usage FAQ | Google Cloud | [官方文档](https://docs.cloud.google.com/speech-to-text/docs/v1/data-usage-faq) | 动态文档；访问日快照 | 2026-08-14 | A2 | 官方说明未加入数据日志选择时，客户内容仅用于提供服务；仍需核验中国处理地域、DPA、保存、删除与跨境。 | 供应商选型/合同、项目日志设置和上线前复核。 |
| AI-08 | Cloud Text-to-Speech：Create voice audio files | Google Cloud | [官方文档](https://docs.cloud.google.com/text-to-speech/docs/create-audio) | 动态文档；访问日快照 | 2026-08-14 | A2 | 支持文本或 SSML 生成音频并设置声音、音高、音量、语速和采样率；不证明中文专名或景区噪声效果。 | 语音 PoC、许可/地域/价格与专名词典复核。 |
| AI-09 | Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile (NIST AI 600-1) | U.S. National Institute of Standards and Technology | [发布页](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence)；[PDF](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) | 2024-07 发布 | 2026-08-14 | A2 | 生成式 AI 风险治理一手框架，覆盖虚构、隐私、IP、测量与管理；可作评测/红队参考，不是中国强制法规。 | 评测体系设计时映射，框架修订时复核。 |
| AI-10 | AI Risk Management Framework | U.S. National Institute of Standards and Technology | [官方页面](https://www.nist.gov/itl/ai-risk-management-framework) | 动态页面；访问日快照 | 2026-08-14 | A2 | 提供 Govern/Map/Measure/Manage 生命周期思路，可用于建立责任、风险和持续评测；不替代中国监管或项目验收。 | 风险治理评审和新版本发布时复核。 |

## 九、使用与复核规则

1. 正文引用必须同时保留 ID 与可点击来源，不允许只写“网上资料显示”。
2. 官方技术文档只证明厂商宣称的通用能力；六祖镇 POI、入口、路网、定位精度、弱网和语音质量必须另有 PoC/现场证据。
3. 法规/标准的摘要只用于产品风险识别，不能替代律师、测绘资质单位、景区主管方或监管机关的正式意见。
4. 协议与价格可能随时变化；截图/缓存本页不能替代签约时的正式合同和报价。
5. 对外发布前核对地图审图号、版权标识、内容许可、AI 标识、来源链接与核验日期。
6. `.env.local` 和任何 API 密钥不得进入本账本、报告、日志或截图；API 快照只保存去密钥结果与能力/错误状态。
