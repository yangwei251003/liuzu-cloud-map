# 全站动效实施矩阵

| 页面 / 区域 | 等级 | 动效 | 触发 | 基准时长 | 技术 |
| --- | --- | --- | --- | --- | --- |
| 全站路由 | 按路由 | 淡入、轻抬升、电影页轻遮罩 | 路由完成 | 240–720ms | Framer Motion |
| 桌面 / 移动导航 | utility | 活动指示滑动、图标与按压反馈 | 路由 / 点击 | 120–340ms | CSS |
| 首页 Hero | cinematic | 文字遮罩、分镜错峰、山水环境层、媒体景深 | 首次进入 / 指针 | 580–920ms | Framer Motion + CSS |
| 首页推荐路线 | cinematic | 章节揭示、装饰路线描边、卡片层次 | 进入视口 / 选择 | 580–1200ms | Framer Motion + SVG |
| 云游 | cinematic | 章节交叉淡化、卡片错峰、印章确认、进度条 | 章节 / 答题 | 180–720ms | CSS + React 状态 |
| 到达、行程、导游 | expressive | 分区揭示、列表重排、表单反馈、步骤进度 | 视口 / 操作 | 180–580ms | CSS + Framer Motion |
| 社区、主页、账号 | expressive | 卡片错峰、图片景深、评论展开、点赞与发布确认 | 视口 / 操作 | 120–580ms | CSS + 既有状态逻辑 |
| 禅小荔 | expressive | 呼吸、状态光圈、思考扫光、回答与错误进入 | 状态机 | 180–1250ms | Framer Motion + CSS |
| 详细地图 | utility | 官方相机聚焦、Marker 弹入 / 波纹、路线绘制、图层过渡 | 地点 / 图层选择 | 180–800ms | AMap / MapLibre / WAAPI / Loca |
| 管理、隐私、分享、实验室 | utility | 快速页面进入、面板、表单、成功 / 失败反馈 | 操作 | 120–320ms | CSS |
| 对话框 | utility | 背景淡入、面板轻抬升缩放 | 打开 / 关闭 | 180–240ms | CSS / 既有 dialog |
| Loading / skeleton | utility | shimmer，离开即停止 | 数据等待 | 1550–1800ms 循环 | CSS |

## 降级矩阵

| 条件 | 保留 | 关闭 / 替换 |
| --- | --- | --- |
| 系统减少动态 | 颜色、边界、即时 opacity 与状态文字 | 位移、缩放、视差、路径流动、循环和复杂转场 |
| 站内简洁显示 | 与系统减少动态相同，并保留标准地图 | 文化环境层、动态光圈、装饰纹理和高负载地图展示 |
| 390px / 触摸设备 | 触摸按压、状态确认、短淡入 | 磁吸、指针倾斜、持续环境位移、长错峰、复杂滚动叙事 |
| 地图 / 管理工具 | 快速状态反馈、SDK 相机 / 图层过渡 | 通用滚动揭示、滚动劫持、持续电影环境动画 |

## 统一接口

- `MotionTier`: `cinematic | expressive | utility`
- `motionDuration`, `motionEase`, `motionSpring`
- `Stagger`, `StaggerItem`, `MaskReveal`, `MagneticAction`, `ParallaxLayer`, `AnimatedValue`, `RouteDraw`, `MotionSection`, `RouteTransition`
- `useMotionPreference`: 合并系统减少动态与站内简洁显示
