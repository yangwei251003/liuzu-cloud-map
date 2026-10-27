# 数据来源与权利登记册

本表登记的是能力状态，不是对数据真实性、许可或可发布性的断言。

| 类别 | 当前来源状态 | 可用于 | 不可用于 | 放行条件 |
| --- | --- | --- | --- | --- |
| 景区边界/入口/内部道路 | 候选/待官方交付 | 本地算法虚构测试 | 正式导航/公开事实 | 管理方数据、许可、现场签字 |
| POI/开放/设施 | 候选/待核验 | 体验原型的明确标注 | 实时承诺 | 官方来源、采集日期、有效期 |
| OSM/公开底图 | 候选研究资料 | 研发参考 | 发布路网或安全路线 | 独立许可及数据审查 |
| 高德地图服务 | 开发展示候选 | 底图/外跳提示（非内部路由） | 未获合同的离线瓦片/内部导航 | 合同、密钥、配额、审图/组合权利 |
| 文化知识/讲解 | 待审核条目 | 来源卡/审核工作流 | 无来源 AI 事实 | 专业/管理方审核与版本 |
| 图片、音频、字体、IP | 逐项登记 | 已明确许可的开发资产 | 未明许可的公开素材 | 权利链、用途和有效期 |
| 定位/行为数据 | 端侧最小化 | 前台导航 | 连续轨迹、训练或公开分享 | 单独评估、同意和保留策略 |

任何来源项变更、撤回或过期必须使关联发布快照和知识缓存失效。禁止把供应商 API 返回值作为事实来源登记。

## 2026-08-15 官方资料复核

下列资料仅能证明景点名称或高层游线顺序，**不能证明景区内部道路几何、入口可通行性、坡度、台阶、封路或导航安全**：

| 来源 | 可确认的有限事实 | 明确不可推导 | 核验状态 |
| --- | --- | --- | --- |
| [云浮市政府：六祖故里旅游度假区](https://www.yunfu.gov.cn/zjyf/lyyf/msfj/content/post_1582810.html) | 度假区位于六祖镇，页面列举国恩寺、古荔枝树、惠能故居、藏佛坑、龙山温泉等资源 | 任意景点坐标、入口、内部道路与推荐步行线 | `OFFICIAL_HIGH_LEVEL_ONLY` |
| [新兴县政府：“禅意之旅”](https://www.xinxing.gov.cn/xxxrmzf/xxdt/gzdt/content/mpost_1895078.html) | 官方文章列出六祖故里、国恩寺、藏佛坑、禾泰农场、神仙谷等高层节点 | 节点之间的安全步行几何、开放状态和 ETA | `OFFICIAL_HIGH_LEVEL_ONLY` |
| [新兴县政府：六祖故里旅游度假区介绍](https://www.xinxing.gov.cn/gkmlpt/content/1/1896/mpost_1896246.html) | 页面列出国恩寺、古荔枝树、舍利子、龙潭湖及周边资源 | 内部路网拓扑、设施位置和无障碍结论 | `OFFICIAL_HIGH_LEVEL_ONLY` |
| [新兴县政府：历史文化游线](https://www.xinxing.gov.cn/xxxrmzf/zjxx/xxwh/content/post_1330232.html) | 页面给出惠能广场、禅域小镇、国恩寺、藏佛坑的高层游览顺序 | 将顺序转换为游客内部导航折线 | `OFFICIAL_HIGH_LEVEL_ONLY` |
| [新兴县政府：国恩寺出入口安全检查](https://www.xinxing.gov.cn/yfxxliuzu/gkmlpt/content/1/1888/post_1888704.html) | 官方记录表明出入口与阻车设施会接受现场安全检查和调整 | 把历史检查记录当作当前入口开放或可通行证明 | `OFFICIAL_OPERATION_CONTEXT_ONLY` |
| [高德 URI API](https://lbs.amap.com/api/uri-api/summary) | 可在移动端唤起高德应用/H5 展示点位或公共路线 | 景区自有内部道路、实时封路和安全放行 | `SUPPLIER_CAPABILITY_ONLY` |
| [高德 Web 服务路径规划](https://lbs.amap.com/api/webservice/guide/api/direction) | 供应商提供公共路径规划能力 | 代替项目正式内部路网或现场运营状态 | `SUPPLIER_CAPABILITY_ONLY` |

## 虚构导航实验室

`src/lib/fictional-navigation-lab.ts` 的名称、坐标、道路和运营状态全部为合成软件测试数据。对外结果强制包含：

- `classification: FICTIONAL_SIMULATION`
- `realWorldUseProhibited: true`
- `realWorldCorrespondence: NONE`

内部用于复用严格发布校验器的模拟对象保持模块私有，不进入正式 GIS/API/数据库、账号历史或现场导览。生产构建默认关闭该页面，只有显式设置 `FICTIONAL_NAVIGATION_LAB_ENABLED=1` 才能用于受控演示。
