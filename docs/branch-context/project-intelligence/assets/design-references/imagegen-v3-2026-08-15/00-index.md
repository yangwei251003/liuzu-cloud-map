# 六祖云游逐页视觉母版索引

生成日期：2026-08-15  
用途：本轮网页端与移动端视觉重构的逐页设计依据，不作为可直接发布的景区事实、地图数据或实景照片。  
生成方式：Codex 内置 ImageGen。  
核验结果：15/15 张均可正常解码，统一为 1536 × 1024；每张同画布包含桌面端与 390 手机端。  

## 统一视觉合同

- 主色：宣纸白、森林绿、路线金、克制朱砂红与深茶褐。
- 字体层级：中式衬线展示标题，紧凑无衬线控件与正文。
- 栅格：桌面 1440 级宽屏与移动 390 × 844 同画布表达；核心任务在首屏可识别。
- 视觉语义：真实地图与可执行状态优先；水墨和插画只承担氛围与层级，不替代地理事实。
- 动效：用于导航、状态反馈、展开收起和空间关系；支持减少动态、高对比与简化视觉。
- 事实边界：母版中的示意地图、标签和图像均不能单独证明真实坐标、路线、开放状态、票价或安全性。

## 页面覆盖

| 编号 | 页面 | 路由 | 母版文件 | 状态 |
|---|---|---|---|---|
| 01 | 首页 | `/` | `01-home-responsive-master.png` | 已生成 |
| 02 | 详细地图 | `/map` | `02-map-responsive-master.png` | 已生成 |
| 03 | 路线规划 | `/plan` | `03-plan-responsive-master.png` | 已生成 |
| 04 | 我的旅程 | `/journey` | `04-journey-responsive-master.png` | 已生成 |
| 05 | 知识卡 | `/journey/knowledge` | `05-knowledge-responsive-master.png` | 已生成 |
| 06 | 线上云游 | `/cloud-tour` | `06-cloud-tour-responsive-master.png` | 已生成 |
| 07 | 到达助手 | `/arrival` | `07-arrival-responsive-master.png` | 已生成 |
| 08 | 前台导览 | `/guide` | `08-guide-responsive-master.png` | 已生成 |
| 09 | 文化问答 | `/guide/ask` | `09-guide-ask-responsive-master.png` | 已生成 |
| 10 | 账号 | `/account` | `10-account-responsive-master.png` | 已生成 |
| 11 | 数据与隐私 | `/privacy` | `11-privacy-responsive-master.png` | 已生成 |
| 12 | 分享路线 | `/share` | `12-share-responsive-master.png` | 已生成 |
| 13 | 治理后台 | `/admin` | `13-admin-responsive-master.png` | 已生成 |
| 14 | 发布准备度 | `/admin/readiness` | `14-readiness-responsive-master.png` | 已生成 |
| 15 | 地图编辑器 | `/admin/map-editor` | `15-map-editor-responsive-master.png` | 已生成 |

## 用户参考图

- `reference-home-target.png`：首页结构与视觉密度硬目标。
- `reference-map-target.png`：地图工作台结构与视觉密度硬目标。

实现时不直接把整张 UI 母版作为页面图片嵌入；应还原其布局、层级、材质、控件与响应式行为，同时继续使用项目中已登记的真实资产和数据状态。
