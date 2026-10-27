# 文件级工程实施计划 (07-implementation-plan.md)

## 1. 目标与原则
在独立 Worktree (`yunyou-map-home-map-first-auth`) 和独立分支 (`judge/home-map-first-auth-20260819`) 下完成本次重构。
严禁改动原工作区、鉴权后端接口协议、数据库结构或地图密钥。

---

## 2. 修改与新增文件清单

### 2.1 首页“地图优先”重构模块
1. **`src/components/HomeReferenceExperience.tsx` [MODIFY]**：
   - 将精简导航栏高度优化至 ~70px；
   - 重构首屏结构：首屏直接渲染 `DetailedMapSurface`，容器高度设为 `min-h-[calc(100svh-72px)]`；
   - 增加地图上方的沉浸式浮动控制栏：包含主搜索入口与 5 大核心功能快捷胶囊（查看、导航、规划、图层、社区）；
   - 将原整行地图风格选择器重构为地图右上角收放自如的紧凑图层/皮肤选择器；
   - 优化选中点位（Spot Card）悬浮卡，提供：
     - 🎙️ 听景点故事；
     - 🧭 导航到这里（直达站内高德真实路线）；
     - 📅 加入行程 / 智能规划；
     - 💬 查看该地点社区游客打卡与讨论；
   - 将原宣传轮播区、文化介绍段落、半日路线列表重新排序至地图主舞台之后，形成顺畅的向下探索流；
   - 保留地图供应商版权和审图号信息，不遮挡、不裁切。
2. **`src/components/HomeReferenceExperience.module.css` [MODIFY]**：
   - 适配地图主舞台全宽与自适应视口高度；
   - 编写浮动工具栏、紧凑图层菜单、点位行动卡的高对比度毛玻璃样式；
   - 移动端 390px 媒体查询适配（底部抽屉展开、触控安全区）。

### 2.2 登录/注册页体验升级模块
3. **`src/components/VisitorAccountCenter.tsx` [MODIFY]**：
   - 重构桌面端双栏布局：左侧呈现六祖云游“从地图开始探索”的品牌意境区与纯净隐私承诺，右侧承载精致表单卡片；
   - 增加密码明文/密文一键切换（眼睛图标）；
   - 支持 URL Query `?redirect=` 参数：登录成功后若存在合法回跳路径则平滑重定向，支持返回原被拦截页面；
   - 增加“暂不登录，返回地图探索”明确返回链接；
   - 移动端自适应单栏优化，键盘弹出时表单不产生布局抖动与关键元素遮挡。
4. **`src/app/account/page.tsx` [MODIFY]**：
   - 优化页面 Header 与外层 Shell，提升整体视觉开阔度。

### 2.3 测试与验证模块
5. **`tests/map-workspace-ui.test.mjs` [MODIFY/EXTEND]**：
   - 保持现有自动化测试覆盖，增加首页地图优先首屏及登录页回跳的断言。
6. **`artifacts/home-map-first/*.png` [NEW]**：
   - 产出改造后的 5 大视口截图及交互证据。

---

## 3. 分阶段实施与提交计划

1. **Step 1: chore: create isolated home-map-first baseline and docs** (基线隔离与设计文档)
2. **Step 2: feat(home): make interactive map the primary hero** (首页首屏地图化与浮动搜索/胶囊)
3. **Step 3: feat(map): refine homepage controls and place actions** (图层紧凑化与五类能力联动)
4. **Step 4: feat(auth): redesign login and registration experience** (登录注册页双栏美化与回跳)
5. **Step 5: fix(responsive): stabilize map and auth layouts across viewports** (多端响应式与手势调优)
6. **Step 6: test: add homepage and auth regression coverage** (自动化测试与端到端验证)
7. **Step 7: docs: add validation evidence and handoff report** (最终交付报告与回滚方案)
